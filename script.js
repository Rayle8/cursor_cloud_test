const form = document.getElementById("loan-form");
const resultsPanel = document.getElementById("results-panel");
const schedulePanel = document.getElementById("schedule-panel");
const scheduleWrapper = document.getElementById("schedule-wrapper");
const scheduleBody = document.getElementById("schedule-body");
const paymentAmountEl = document.getElementById("payment-amount");
const totalPaidEl = document.getElementById("total-paid");
const totalInterestEl = document.getElementById("total-interest");
const payoffTimeEl = document.getElementById("payoff-time");
const toggleScheduleBtn = document.getElementById("toggle-schedule");
const downloadCsvBtn = document.getElementById("download-csv");
const resetBtn = document.getElementById("reset-btn");

let lastSchedule = [];
let lastSummary = null;

const formatterCurrency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});

const formatterNumber = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

const frequencyLabels = {
  12: "月",
  26: "两周",
  52: "周",
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();

  const formData = new FormData(form);
  const principal = parseFloat(formData.get("amount"));
  const rate = parseFloat(formData.get("rate"));
  const years = parseFloat(formData.get("years"));
  const paymentsPerYear = parseInt(formData.get("frequency"), 10);
  const extra = parseFloat(formData.get("extra")) || 0;

  const errors = validateInputs({ principal, rate, years, extra });

  if (Object.keys(errors).length > 0) {
    showErrors(errors);
    resultsPanel.hidden = true;
    schedulePanel.hidden = true;
    return;
  }

  const calculation = calculateLoan({
    principal,
    annualRate: rate,
    years,
    paymentsPerYear,
    extraPayment: extra,
  });

  updateSummary(calculation);
  renderSchedule(calculation.schedule);
  lastSchedule = calculation.schedule;
  lastSummary = calculation.summary;

  resultsPanel.hidden = false;
  schedulePanel.hidden = calculation.schedule.length === 0;
  scheduleWrapper.classList.remove("expanded");
});

toggleScheduleBtn.addEventListener("click", () => {
  if (!schedulePanel.hidden) {
    scheduleWrapper.classList.toggle("expanded");
  }
});

downloadCsvBtn.addEventListener("click", () => {
  if (lastSchedule.length === 0) {
    return;
  }

  const header = ["期数", "当期还款", "本金", "利息", "剩余本金"];
  const rows = lastSchedule.map((entry) => [
    entry.period,
    formatNumber(entry.payment),
    formatNumber(entry.principal),
    formatNumber(entry.interest),
    formatNumber(entry.balance),
  ]);

  const csvContent = [header, ...rows]
    .map((line) => line.join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().split("T")[0];

  link.href = url;
  link.download = `loan_schedule_${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

resetBtn.addEventListener("click", () => {
  resultsPanel.hidden = true;
  schedulePanel.hidden = true;
  scheduleWrapper.classList.remove("expanded");
  scheduleBody.innerHTML = "";
  lastSchedule = [];
  lastSummary = null;
  clearErrors();
});

function validateInputs({ principal, rate, years, extra }) {
  const errors = {};

  if (!Number.isFinite(principal) || principal <= 0) {
    errors.amount = "请输入大于 0 的贷款金额。";
  }

  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    errors.rate = "年利率需在 0% 至 100% 之间。";
  }

  if (!Number.isFinite(years) || years <= 0) {
    errors.years = "贷款年限需大于 0。";
  }

  if (!Number.isFinite(extra) || extra < 0) {
    errors.extra = "额外还款需大于或等于 0。";
  }

  return errors;
}

function showErrors(errors) {
  Object.entries(errors).forEach(([key, message]) => {
    const el = document.querySelector(`.error-message[data-for="${key}"]`);
    if (el) {
      el.textContent = message;
    }
  });
}

function clearErrors() {
  document
    .querySelectorAll(".error-message")
    .forEach((el) => (el.textContent = ""));
}

function calculateLoan({
  principal,
  annualRate,
  years,
  paymentsPerYear,
  extraPayment,
}) {
  const periodicRate = annualRate > 0 ? annualRate / 100 / paymentsPerYear : 0;
  const totalPeriods = Math.max(1, Math.round(years * paymentsPerYear));
  const basePayment =
    periodicRate === 0
      ? principal / totalPeriods
      : (principal * periodicRate) /
        (1 - Math.pow(1 + periodicRate, -totalPeriods));

  const schedule = [];
  let balance = principal;
  let period = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  const paymentWithExtra = basePayment + extraPayment;

  const maxIterations = totalPeriods * 2 + 10;

  while (balance > 0 && period < maxIterations) {
    period += 1;
    const interest = periodicRate === 0 ? 0 : balance * periodicRate;
    let payment = Math.min(paymentWithExtra, balance + interest);
    let principalPaid = payment - interest;

    if (principalPaid > balance) {
      principalPaid = balance;
      payment = principalPaid + interest;
    }

    balance = Math.max(0, balance - principalPaid);
    totalInterest += interest;
    totalPaid += payment;

    schedule.push({
      period,
      payment,
      principal: principalPaid,
      interest,
      balance,
    });

    if (balance <= 0.01) {
      balance = 0;
      break;
    }
  }

  const payoffLabel = formatPayoffTime(period, paymentsPerYear);

  return {
    schedule,
    summary: {
      paymentPerPeriod: paymentWithExtra,
      basePayment,
      totalPaid,
      totalInterest,
      payoffLabel,
    },
  };
}

function updateSummary({ summary }) {
  const { paymentPerPeriod, totalPaid, totalInterest, payoffLabel, basePayment } =
    summary;

  const extra = paymentPerPeriod - basePayment;

  const paymentText =
    extra > 0.01
      ? `${formatterCurrency.format(paymentPerPeriod)}（含基础 ${formatterCurrency.format(
          basePayment
        )} + 额外 ${formatterCurrency.format(extra)}）`
      : formatterCurrency.format(paymentPerPeriod);

  paymentAmountEl.textContent = paymentText;
  totalPaidEl.textContent = formatterCurrency.format(totalPaid);
  totalInterestEl.textContent = formatterCurrency.format(totalInterest);
  payoffTimeEl.textContent = payoffLabel;
}

function renderSchedule(schedule) {
  scheduleBody.innerHTML = "";

  if (schedule.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();

  schedule.forEach((entry) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${entry.period}</td>
      <td>${formatterCurrency.format(entry.payment)}</td>
      <td>${formatterCurrency.format(entry.principal)}</td>
      <td>${formatterCurrency.format(entry.interest)}</td>
      <td>${formatterCurrency.format(entry.balance)}</td>
    `;
    fragment.appendChild(row);
  });

  scheduleBody.appendChild(fragment);
}

function formatPayoffTime(periods, paymentsPerYear) {
  const years = Math.floor(periods / paymentsPerYear);
  const remainder = periods % paymentsPerYear;
  const periodLabel = frequencyLabels[paymentsPerYear] || "期";

  if (years === 0 && remainder === 0) {
    return "不足一个周期";
  }

  const parts = [];
  if (years > 0) {
    parts.push(`${years}年`);
  }

  if (remainder > 0) {
    if (paymentsPerYear === 12) {
      parts.push(`${remainder}个月`);
    } else if (paymentsPerYear === 26) {
      parts.push(`${remainder}个两周期`);
    } else if (paymentsPerYear === 52) {
      parts.push(`${remainder}周`);
    } else {
      parts.push(`${remainder}${periodLabel}`);
    }
  }

  return parts.join("");
}

function formatNumber(value) {
  return formatterNumber.format(value);
}
