// ─── PHONE FORMATTER ─────────────────────────────────────────────────────────
function formatPhoneInput(input) {
  let value = input.value.replace(/\D/g, '').slice(0, 10);
  if (value.length > 3 && value.length <= 6) {
    value = value.slice(0, 3) + '-' + value.slice(3);
  } else if (value.length > 6) {
    value = value.slice(0, 3) + '-' + value.slice(3, 6) + '-' + value.slice(6);
  }
  input.value = value;
}

function cleanPhone(phone) {
  return phone.replace(/\D/g, '');
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────
const phoneInput = document.getElementById('phone-input');
const searchBtn = document.getElementById('search-btn');
const searchResult = document.getElementById('search-result');

if (phoneInput) {
  phoneInput.addEventListener('input', () => formatPhoneInput(phoneInput));
  phoneInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

if (searchBtn) {
  searchBtn.addEventListener('click', doSearch);
}

async function doSearch() {
  const raw = phoneInput?.value || '';
  const clean = cleanPhone(raw);

  if (clean.length < 9) {
    showResult('กรุณากรอกเบอร์โทรให้ครบ', 'error');
    return;
  }

  searchBtn.disabled = true;
  searchBtn.querySelector('.btn-text') && (searchBtn.querySelector('.btn-text').textContent = 'กำลังตรวจสอบ...');

  try {
    const res = await fetch(`/api/search?phone=${clean}`);
    const data = await res.json();

    if (data.found) {
      showResult(
        `🚨 พบเบอร์ ${formatPhone(clean)} ในฐานข้อมูลมิจฉาชีพ! <a href="${data.url}">ดูรายละเอียด →</a>`,
        'found'
      );
      setTimeout(() => {
        window.location.href = data.url;
      }, 1200);
    } else {
      showResult(
        `✅ ยังไม่พบเบอร์ ${formatPhone(clean)} ในฐานข้อมูล <a href="${data.url}">ดูหน้าเบอร์นี้ →</a>`,
        'not-found'
      );
    }
  } catch (e) {
    showResult('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  } finally {
    searchBtn.disabled = false;
    if (searchBtn.querySelector('.btn-text')) {
      searchBtn.querySelector('.btn-text').textContent = 'ตรวจสอบ';
    }
  }
}

function showResult(msg, cls) {
  if (!searchResult) return;
  searchResult.innerHTML = msg;
  searchResult.className = `search-result ${cls}`;
}

function formatPhone(digits) {
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

// ─── REPORT FORM ─────────────────────────────────────────────────────────────
const reportForm = document.getElementById('report-form');
const reportMsg = document.getElementById('report-msg');
const reportPhone = document.getElementById('report-phone');

if (reportPhone) {
  reportPhone.addEventListener('input', () => formatPhoneInput(reportPhone));
}

if (reportForm) {
  reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(reportForm);
    const body = Object.fromEntries(formData.entries());

    // Clean phone
    body.phone = cleanPhone(body.phone || '');

    if (body.phone.length < 9) {
      showMsg('กรุณากรอกเบอร์โทรให้ถูกต้อง', 'error');
      return;
    }

    const btn = reportForm.querySelector('.submit-btn');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'กำลังส่ง...';

    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        showMsg(`✅ รายงานสำเร็จ! <a href="${data.url}" style="color:inherit">ดูหน้าเบอร์ ${formatPhone(body.phone)} →</a>`, 'success');
        reportForm.reset();
      } else {
        showMsg(data.error || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (e) {
      showMsg('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = '📢 แจ้งเบอร์นี้';
    }
  });
}

function showMsg(msg, type) {
  if (!reportMsg) return;
  reportMsg.innerHTML = msg;
  reportMsg.className = `report-msg ${type}`;
}

// ─── ANIMATE NUMBERS ─────────────────────────────────────────────────────────
function animateNumber(el) {
  const target = parseInt(el.textContent.replace(/\D/g, ''));
  if (isNaN(target) || target === 0) return;
  const duration = 1200;
  const start = performance.now();
  const update = (now) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  };
  el.textContent = '0';
  requestAnimationFrame(update);
}

// Observe stat numbers and animate on scroll
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      animateNumber(entry.target);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.stat-num, .stat-big, .v-num').forEach((el) => {
  if (/^\d/.test(el.textContent.trim())) observer.observe(el);
});
