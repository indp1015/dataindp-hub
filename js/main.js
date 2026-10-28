const CURRENT_YEAR = new Date().getFullYear();
document.querySelectorAll('.currentYear').forEach(el => el.textContent = CURRENT_YEAR);

let dashboardData = {};
let globalMortgageRate = 7.0;

// 🌟 유틸리티: 이름 축약
const STATE_ABBR = { 'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO','connecticut':'CT','delaware':'DE','district-of-columbia':'DC','florida':'FL','georgia':'GA','hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new-hampshire':'NH','new-jersey':'NJ','new-mexico':'NM','new-york':'NY','north-carolina':'NC','north-dakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode-island':'RI','south-carolina':'SC','south-dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA','west-virginia':'WV','wisconsin':'WI','wyoming':'WY','puerto-rico':'PR' };
const STATE_KEYS_SORTED = Object.keys(STATE_ABBR).sort((a, b) => b.length - a.length);

function nameFromSlug(slug) {
  if (!slug) return 'Unknown County';
  for (const st of STATE_KEYS_SORTED) {
    if (slug.endsWith('-' + st)) {
      const countyPart = slug.slice(0, -1 - st.length);
      const countyName = countyPart.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return `${countyName}, ${STATE_ABBR[st]}`;
    }
  }
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function fmt1(v) { return (v == null || isNaN(v)) ? '–' : (Math.round(v * 10) / 10).toFixed(1); }

// 🌟 1. Top Livability 렌더링
function renderTopLivability(top) {
  const container = document.getElementById('livabilityCards');
  container.innerHTML = top.map((row, i) => {
    const link = `https://housing.dataindp.com/counties/${row.slug}.html`;
    return `
      <a href="${link}" class="livability-card-mini">
        <h4>#${i + 1} ${row.name}</h4>
        <div class="score">${fmt1(row.composite)}</div>
        <div class="tier">${row.tier || 'Top Tier'}</div>
      </a>
    `;
  }).join('');
  document.getElementById('livabilityLoader').style.display = 'none';
  container.style.display = 'grid';
}

async function fetchTopLivability() {
  try {
    const res = await fetch('https://housing.dataindp.com/data/top_livability.json');
    if (res.ok) {
      const small = await res.json();
      if (small.top && small.top.length) {
        renderTopLivability(small.top.slice(0, 3).map(r => ({ slug: r.slug, name: r.name || nameFromSlug(r.slug), composite: r.composite, tier: r.tier })));
        return;
      }
    }
  } catch (e) { console.error(e); }
}

// 🌟 2. 모기지 금리 차트 렌더링
async function renderMortgageChart() {
  try {
    // 🆕 새로 생성된 차트용 JSON 파일 호출
    const res = await fetch('https://housing.dataindp.com/data/mortgage_trends.json');
    if (!res.ok) throw new Error('Chart data not found');
    const data = await res.json();
    
    // 데이터 구조에 맞게 추출 (trends 배열 안에 date, value)
    const observations = data.trends || [];
    if (observations.length === 0) throw new Error('No observation data');

    const labels = observations.map(d => d.date);
    // 🌟 문자열을 실수(float)로 변환하여 차트 오류 방지
    const values = observations.map(d => parseFloat(d.value)); 

    const ctx = document.getElementById('mortgageChart');
    if(!ctx) return;

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '30-Year Fixed Rate (%)',
          data: values,
          borderColor: '#1a3d5c',
          backgroundColor: 'rgba(26, 61, 92, 0.1)',
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.parsed.y.toFixed(2) + '%';
              }
            }
          }
        },
        scales: { 
          x: { display: false }, 
          y: { 
            display: true, 
            ticks: { 
              callback: function(value) { return value + '%'; },
              maxTicksLimit: 5
            } 
          } 
        }
      }
    });
  } catch (e) { 
    console.error('Chart error', e); 
    // 🆕 데이터가 없을 경우 차트 영역에 안내 문구 표시
    const chartContainer = document.getElementById('mortgageChart').parentElement;
    if (chartContainer) {
      chartContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:0.9em;">Chart data currently unavailable.</div>';
    }
  }
}

// 🌟 3. 대시보드 데이터 Fetch 및 병합
async function fetchDashboardData() {
  try {
    const [housingRes, insRes, solarRes] = await Promise.all([
      fetch('https://housing.dataindp.com/data/dashboard_data.json'),
      fetch('https://insurance.dataindp.com/data/dashboard_insurance.json'),
      fetch('https://solar.dataindp.com/data/dashboard_solar.json')
    ]);

    if (!housingRes.ok) throw new Error('Housing data load failed');
    
    const housingJson = await housingRes.json();
    const insJson = insRes.ok ? await insRes.json() : { counties: {} }; 
    const solarJson = solarRes.ok ? await solarRes.json() : { counties: {} }; 

    dashboardData = housingJson.counties || {};
    globalMortgageRate = housingJson.metadata.mortgage_rate_30yr || globalMortgageRate;

    // 🆕 최신 업데이트 날짜 표시
    if (housingJson.metadata.generated_at) {
      const dateObj = new Date(housingJson.metadata.generated_at);
      document.getElementById('last-updated').textContent = `Data updated: ${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    // 보험 및 태양광 병합
    const insByFips = {};
    if (insJson.counties) Object.values(insJson.counties).forEach(item => insByFips[item.fips] = item);
    const solarByFips = {};
    if (solarJson.counties) Object.values(solarJson.counties).forEach(item => solarByFips[item.fips] = item);

    Object.keys(dashboardData).forEach(slug => {
      const fips = dashboardData[slug].fips;
      if (insByFips[fips]) {
        dashboardData[slug].insurance_annual = insByFips[fips].premium;
        dashboardData[slug].fema_risk = insByFips[fips].fema_risk;
      }
      if (solarByFips[fips]) {
        dashboardData[slug].solar_payback = solarByFips[fips].payback_years;
        dashboardData[slug].solar_roi = solarByFips[fips].roi_25y_pct;
        dashboardData[slug].solar_savings = solarByFips[fips].annual_savings;
      }
    });

    // 🆕 Did You Know 사실 추출
    generateDidYouKnow();

    // 검색 로직 세팅
    setupSearch('countySearch1', 'countyResults1', (slug) => updateDashboard(slug, 1));
    setupSearch('countySearch2', 'countyResults2', (slug) => updateDashboard(slug, 2));

    // 초기값 세팅
    const sortedSlugs = Object.keys(dashboardData).sort((a, b) => dashboardData[a].name.localeCompare(dashboardData[b].name));
    if (sortedSlugs.length > 0) {
      document.getElementById('countySearch1').value = dashboardData[sortedSlugs[0]].name;
      updateDashboard(sortedSlugs[0], 1);
    }

  } catch (err) {
    console.error('Dashboard data load failed:', err);
    document.getElementById('dash-explanation').textContent = 'Dashboard data is currently unavailable. Please try again later.';
  }
}

// 🌟 4. 검색 기능 셋업
function setupSearch(inputId, listId, onSelect) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  const sortedSlugs = Object.keys(dashboardData).sort((a, b) => dashboardData[a].name.localeCompare(dashboardData[b].name));

  function renderOptions(query = '') {
    const filtered = sortedSlugs.filter(slug => dashboardData[slug].name.toLowerCase().includes(query.toLowerCase())).slice(0, 100); 
    list.innerHTML = filtered.length === 0 ? '<li style="color:#999;cursor:default;">No counties found</li>' : 
      filtered.map(slug => `<li data-slug="${slug}">${dashboardData[slug].name}</li>`).join('');
    list.style.display = 'block';
  }

  input.addEventListener('focus', () => renderOptions(input.value));
  input.addEventListener('input', (e) => renderOptions(e.target.value));
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-container')) list.style.display = 'none'; });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li && li.dataset.slug) {
      input.value = dashboardData[li.dataset.slug].name;
      list.style.display = 'none';
      onSelect(li.dataset.slug);
    }
  });
}

// 🌟 5. 대시보드 UI 업데이트 (비교 로직 포함)
function updateDashboard(slug, panelNum = 1) {
  const data = dashboardData[slug];
  if (!data) return;

  // UI 패널 보이기 처리
  if (panelNum === 2) {
    document.getElementById('panel-2').style.display = 'flex';
    document.getElementById('dashboardGrid').style.gridTemplateColumns = '1fr 1fr';
  }

  const suffix = `-${panelNum}`;
  
  document.getElementById(`name${suffix}`).textContent = data.name;
  document.getElementById(`dash-home-price${suffix}`).textContent = '$' + data.home_price.toLocaleString();
  document.getElementById(`dash-tax-rate${suffix}`).textContent = data.tax_rate ? data.tax_rate.toFixed(2) + '%' : 'N/A';
  document.getElementById(`dash-insurance${suffix}`).textContent = data.insurance_annual ? '$' + data.insurance_annual.toLocaleString() : 'N/A';
  document.getElementById(`dash-fema${suffix}`).textContent = data.fema_risk ? data.fema_risk.toFixed(1) + ' / 100' : 'N/A';
  document.getElementById(`dash-solar-payback${suffix}`).textContent = data.solar_payback ? data.solar_payback.toFixed(1) + ' Years' : 'N/A';
  document.getElementById(`dash-solar-roi${suffix}`).textContent = data.solar_roi ? data.solar_roi.toFixed(0) + '%' : 'N/A';
  document.getElementById(`dash-market-score${suffix}`).textContent = data.market_score ? data.market_score.toFixed(1) + ' / 100' : 'N/A';
  document.getElementById(`dash-livability${suffix}`).textContent = data.livability ? data.livability.toFixed(1) + ' / 100' : 'N/A';

  // PITI 계산
  const price = data.home_price;
  const loanAmount = price * 0.8;
  const monthlyRate = (globalMortgageRate / 100) / 12;
  const numPayments = 30 * 12;

  let pi = 0;
  if (loanAmount > 0 && monthlyRate > 0) {
    pi = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
  }

  const monthlyTax = (price * ((data.tax_rate || 0) / 100)) / 12;
  const monthlyIns = (data.insurance_annual || 0) / 12;
  
  const roundedPi = Math.round(pi);
  const roundedTax = Math.round(monthlyTax);
  const roundedIns = Math.round(monthlyIns);
  const totalPITI = roundedPi + roundedTax + roundedIns; 

  document.getElementById(`dash-pi${suffix}`).textContent = '$' + roundedPi.toLocaleString();
  document.getElementById(`dash-monthly-tax${suffix}`).textContent = '$' + roundedTax.toLocaleString();
  document.getElementById(`dash-monthly-ins${suffix}`).textContent = data.insurance_annual ? '$' + roundedIns.toLocaleString() : 'N/A';
  document.getElementById(`dash-piti-total${suffix}`).textContent = '$' + totalPITI.toLocaleString();

  // 분석 텍스트 (Primary 카운티만 상세 분석 생성)
  if (panelNum === 1) {
    let analysis = `<strong>Analysis for ${data.name}:</strong> The median home price is $${price.toLocaleString()}. `;
    analysis += `With a property tax rate of ${data.tax_rate ? data.tax_rate.toFixed(2) + '%' : 'N/A'}, taxes add about $${roundedTax.toLocaleString()} per month. `;
    if (data.insurance_annual) analysis += `Homeowners insurance is estimated at $${data.insurance_annual.toLocaleString()} annually (about $${roundedIns.toLocaleString()}/month) based on FEMA climate risk data. `;
    if (data.solar_payback) analysis += `A 6kW solar installation would pay for itself in roughly ${data.solar_payback.toFixed(1)} years, yielding a 25-year ROI of ${data.solar_roi.toFixed(0)}%. `;
    if (data.market_score) analysis += `The local market score is ${data.market_score.toFixed(1)}/100. `;
    
    document.getElementById('dash-explanation').innerHTML = analysis;
  }
}

// 🌟 6. Did You Know 데이터 하이라이트 생성
function generateDidYouKnow() {
  let highestTax = { name: '', val: 0 };
  let bestSolar = { name: '', val: 999 };
  let worstSolar = { name: '', val: 0 };

  Object.values(dashboardData).forEach(c => {
    if (c.tax_rate && c.tax_rate > highestTax.val) highestTax = { name: c.name, val: c.tax_rate };
    if (c.solar_payback && c.solar_payback < bestSolar.val) bestSolar = { name: c.name, val: c.solar_payback };
    if (c.solar_payback && c.solar_payback > worstSolar.val) worstSolar = { name: c.name, val: c.solar_payback };
  });

  const facts = [
    `Did you know? <strong>${highestTax.name}</strong> has one of the highest effective property tax rates in the country at <strong>${highestTax.val.toFixed(2)}%</strong>.`,
    `Did you know? Homeowners in <strong>${bestSolar.name}</strong> can expect a solar payback period of just <strong>${bestSolar.val.toFixed(1)} years</strong>.`,
    `Did you know? In <strong>${worstSolar.name}</strong>, the solar payback period can stretch up to <strong>${worstSolar.val.toFixed(1)} years</strong> due to lower electricity rates or less sunlight.`
  ];

  // 랜덤하게 하나 선택하여 표시
  const randomFact = facts[Math.floor(Math.random() * facts.length)];
  document.getElementById('did-you-know-text').innerHTML = randomFact;
}

// 🌟 초기화
document.addEventListener('DOMContentLoaded', () => {
  fetchTopLivability();
  fetchDashboardData();
  renderMortgageChart();
  
  document.querySelectorAll('.faq-item h4').forEach(item => {
    item.addEventListener('click', () => item.parentElement.classList.toggle('active'));
  });
});