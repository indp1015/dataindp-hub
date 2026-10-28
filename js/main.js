const CURRENT_YEAR = new Date().getFullYear();
document.querySelectorAll('.currentYear').forEach(el => el.textContent = CURRENT_YEAR);

// 🌟 대시보드 전역 변수
let dashboardData = {};
let globalMortgageRate = 7.0; 

const STATE_ABBR = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','district-of-columbia':'DC',
  'florida':'FL','georgia':'GA','hawaii':'HI','idaho':'ID','illinois':'IL',
  'indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY','louisiana':'LA',
  'maine':'ME','maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN',
  'mississippi':'MS','missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV',
  'new-hampshire':'NH','new-jersey':'NJ','new-mexico':'NM','new-york':'NY',
  'north-carolina':'NC','north-dakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR',
  'pennsylvania':'PA','rhode-island':'RI','south-carolina':'SC','south-dakota':'SD',
  'tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA',
  'washington':'WA','west-virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'puerto-rico':'PR'
};
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

// 🌟 1. Top Livability 카드 렌더링
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
  const cacheKey = 'livability_top_v1';
  const cachedAt = 'livability_top_v1_at';
  const now = Date.now();
  try {
    const cached = sessionStorage.getItem(cacheKey);
    const ts = parseInt(sessionStorage.getItem(cachedAt) || '0');
    if (cached && (now - ts) < 5 * 60 * 1000) {
      renderTopLivability(JSON.parse(cached));
      return;
    }
  } catch (e) { /* ignore */ }

  try {
    const smallRes = await fetch('https://housing.dataindp.com/data/top_livability.json');
    if (smallRes.ok) {
      const small = await smallRes.json();
      if (small.top && small.top.length) {
        const top = small.top.slice(0, 3).map(r => ({ slug: r.slug, name: r.name || nameFromSlug(r.slug), composite: r.composite, tier: r.tier }));
        renderTopLivability(top);
        sessionStorage.setItem(cacheKey, JSON.stringify(top));
        sessionStorage.setItem(cachedAt, String(now));
        return;
      }
    }
    
    // Fallback: 메인 JSON에서 추출 (임시)
    const res = await fetch('https://housing.dataindp.com/static/counties_livability.json');
    const data = await res.json();
    const list = [];
    for (const [fips, c] of Object.entries(data.counties || {})) {
      if(c.axes) {
        let num = 0, den = 0;
        const weights = { affordability: 25, stability: 15, momentum: 15, safety: 15, health: 10, amenities: 20 };
        for (const [k, w] of Object.entries(weights)) {
          if (c.axes[k] != null) { num += c.axes[k] * w; den += w; }
        }
        if (den > 0) list.push({ slug: c.slug, name: nameFromSlug(c.slug), composite: num / den, tier: 'Top Tier' });
      }
    }
    list.sort((a, b) => b.composite - a.composite);
    const top = list.slice(0, 3);
    renderTopLivability(top);
  } catch (e) {
    console.error('Top livability error:', e);
    document.getElementById('livabilityLoader').innerHTML = 'Live rankings are temporarily unavailable.';
  }
}

// 🌟 2. 대시보드 데이터 Fetch 및 병합
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

    const insByFips = {};
    if (insJson.counties) Object.values(insJson.counties).forEach(item => insByFips[item.fips] = item);

    const solarByFips = {};
    if (solarJson.counties) Object.values(solarJson.counties).forEach(item => solarByFips[item.fips] = item);

    Object.keys(dashboardData).forEach(slug => {
      const fips = dashboardData[slug].fips;
      
      if (insByFips[fips]) {
        dashboardData[slug].insurance_annual = insByFips[fips].premium;
        dashboardData[slug].fema_risk = insByFips[fips].fema_risk;
      } else {
        dashboardData[slug].insurance_annual = null;
        dashboardData[slug].fema_risk = null;
      }

      if (solarByFips[fips]) {
        dashboardData[slug].solar_payback = solarByFips[fips].payback_years;
        dashboardData[slug].solar_roi = solarByFips[fips].roi_25y_pct;
        dashboardData[slug].solar_savings = solarByFips[fips].annual_savings;
      } else {
        dashboardData[slug].solar_payback = null;
        dashboardData[slug].solar_roi = null;
        dashboardData[slug].solar_savings = null;
      }
    });

    const searchInput = document.getElementById('countySearch');
    const resultsList = document.getElementById('countyResults');
    
    const sortedSlugs = Object.keys(dashboardData).sort((a, b) => 
      dashboardData[a].name.localeCompare(dashboardData[b].name)
    );

    if (sortedSlugs.length > 0) {
      searchInput.value = dashboardData[sortedSlugs[0]].name;
      updateDashboard(sortedSlugs[0]);
    }

    function renderOptions(query = '') {
      const lowerQuery = query.toLowerCase();
      const filtered = sortedSlugs.filter(slug => 
        dashboardData[slug].name.toLowerCase().includes(lowerQuery)
      ).slice(0, 100); 

      if (filtered.length === 0) {
        resultsList.innerHTML = '<li style="color:#999;cursor:default;">No counties found</li>';
      } else {
        resultsList.innerHTML = filtered.map(slug => 
          `<li data-slug="${slug}">${dashboardData[slug].name}</li>`
        ).join('');
      }
      resultsList.style.display = 'block';
    }

    searchInput.addEventListener('focus', () => renderOptions(searchInput.value));
    searchInput.addEventListener('input', (e) => renderOptions(e.target.value));
    
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) resultsList.style.display = 'none';
    });

    resultsList.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (li && li.dataset.slug) {
        const slug = li.dataset.slug;
        searchInput.value = dashboardData[slug].name;
        resultsList.style.display = 'none';
        updateDashboard(slug);
      }
    });

  } catch (err) {
    console.error('Dashboard data load failed:', err);
    document.getElementById('dash-explanation').textContent = 'Dashboard data is currently unavailable. Please try again later.';
  }
}

// 🌟 3. 대시보드 UI 업데이트
function updateDashboard(slug) {
  const data = dashboardData[slug];
  if (!data) return;

  document.getElementById('dash-home-price').textContent = '$' + data.home_price.toLocaleString();
  document.getElementById('dash-tax-rate').textContent = data.tax_rate ? data.tax_rate.toFixed(2) + '%' : 'N/A';
  document.getElementById('dash-market-score').textContent = data.market_score ? data.market_score.toFixed(1) + ' / 100' : 'N/A';
  
  const livabilityEl = document.getElementById('dash-livability');
  if (data.livability) {
    livabilityEl.textContent = data.livability.toFixed(1) + ' / 100';
  } else {
    livabilityEl.innerHTML = '<span style="font-size: 0.85em; color: #888; font-weight: normal;">Default weights</span>';
  }

  const annualIns = data.insurance_annual || 0;
  document.getElementById('dash-insurance-annual').textContent = annualIns > 0 ? '$' + annualIns.toLocaleString() : 'N/A';
  document.getElementById('dash-fema-risk').textContent = data.fema_risk ? data.fema_risk.toFixed(1) + ' / 100' : 'N/A';

  document.getElementById('dash-solar-payback').textContent = data.solar_payback ? data.solar_payback.toFixed(1) + ' Years' : 'N/A';
  document.getElementById('dash-solar-roi').textContent = data.solar_roi ? data.solar_roi.toFixed(0) + '%' : 'N/A';

  const price = data.home_price;
  const downPct = 20; 
  const rate = globalMortgageRate;
  const taxRate = data.tax_rate || 0;

  const loanAmount = price * (1 - (downPct / 100));
  const monthlyRate = (rate / 100) / 12;
  const numPayments = 30 * 12;

  let pi = 0;
  if (loanAmount > 0 && rate > 0) {
    pi = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
  }

  const monthlyTax = (price * (taxRate / 100)) / 12;
  const monthlyIns = annualIns / 12; 

  const roundedPi = Math.round(pi);
  const roundedTax = Math.round(monthlyTax);
  const roundedIns = Math.round(monthlyIns);
  const totalPITI = roundedPi + roundedTax + roundedIns; 

  document.getElementById('dash-pi').textContent = '$' + roundedPi.toLocaleString();
  document.getElementById('dash-monthly-tax').textContent = '$' + roundedTax.toLocaleString();
  document.getElementById('dash-monthly-ins').textContent = annualIns > 0 ? '$' + roundedIns.toLocaleString() : 'N/A';
  document.getElementById('dash-piti-total').textContent = '$' + totalPITI.toLocaleString();

  let analysis = `<strong>Analysis for ${data.name}:</strong> `;
  analysis += `The median home price is $${price.toLocaleString()}. `;

  if (taxRate > 1.5) {
    analysis += `Property taxes are relatively high here (${taxRate.toFixed(2)}%), adding about $${roundedTax.toLocaleString()} to your monthly payment. `;
  } else {
    analysis += `The effective property tax rate is a manageable ${taxRate.toFixed(2)}%, costing roughly $${roundedTax.toLocaleString()} per month. `;
  }

  if (annualIns > 0) {
    analysis += `Homeowners insurance is estimated at $${annualIns.toLocaleString()} annually (about $${roundedIns.toLocaleString()}/month) based on FEMA climate risk data. `;
  }

  if (data.solar_payback) {
    analysis += `A 6kW solar installation would pay for itself in approximately ${data.solar_payback.toFixed(1)} years, yielding a 25-year ROI of ${data.solar_roi.toFixed(0)}% and saving about $${data.solar_savings.toLocaleString()} annually on energy bills. `;
  }

  if (data.market_score > 60) {
    analysis += `The local housing market is currently rated highly (Market Score: ${data.market_score.toFixed(1)}/100), indicating strong fundamentals. `;
  } else if (data.market_score > 0) {
    analysis += `The market shows a moderate score of ${data.market_score.toFixed(1)}/100, reflecting mixed conditions. `;
  }

  if (data.livability) {
    analysis += `With a Livability Score of ${data.livability.toFixed(1)}, this county offers a solid quality of life relative to national averages. `;
  }

  document.getElementById('dash-explanation').innerHTML = analysis;
}

// 🌟 초기화
document.addEventListener('DOMContentLoaded', () => {
  fetchTopLivability();
  fetchDashboardData();
  
  document.querySelectorAll('.faq-item h4').forEach(item => {
    item.addEventListener('click', () => item.parentElement.classList.toggle('active'));
  });
});