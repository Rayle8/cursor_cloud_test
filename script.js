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

const METHODS = {
  AMORTIZED: "amortized",
  EQUAL_PRINCIPAL: "equal_principal",
  INTEREST_ONLY: "interest_only",
};

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
  const rawMethod = formData.get("method");
  const method =
    typeof rawMethod === "string" && rawMethod.trim() !== ""
      ? rawMethod.trim()
      : METHODS.AMORTIZED;
  const extra = parseFloat(formData.get("extra")) || 0;

  const errors = validateInputs({ principal, rate, years, extra, method });

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
    method,
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

function validateInputs({ principal, rate, years, extra, method }) {
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

  const normalizedMethod =
    typeof method === "string" ? method.trim() : "";

  if (!Object.values(METHODS).includes(normalizedMethod)) {
    errors.method = "请选择有效的还款方式。";
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

function calculateLoan(params) {
  if (params.method === METHODS.EQUAL_PRINCIPAL) {
    return calculateEqualPrincipalLoan(params);
  } else if (params.method === METHODS.INTEREST_ONLY) {
    return calculateInterestOnlyLoan(params);
  }
  return calculateAmortizedLoan(params);
}

function calculateAmortizedLoan({
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
      paymentInfo: {
        type: METHODS.AMORTIZED,
        paymentPerPeriod: paymentWithExtra,
        basePayment,
        extraPayment,
      },
      totalPaid,
      totalInterest,
      payoffLabel,
    },
  };
}

function calculateEqualPrincipalLoan({
  principal,
  annualRate,
  years,
  paymentsPerYear,
  extraPayment,
}) {
  const periodicRate = annualRate > 0 ? annualRate / 100 / paymentsPerYear : 0;
  const totalPeriods = Math.max(1, Math.round(years * paymentsPerYear));
  const basePrincipalPerPeriod = principal / totalPeriods;

  const schedule = [];
  let balance = principal;
  let period = 0;
  let totalInterest = 0;
  let totalPaid = 0;

  const maxIterations = totalPeriods * 2 + 10;

  while (balance > 0 && period < maxIterations) {
    period += 1;
    const interest = periodicRate === 0 ? 0 : balance * periodicRate;
    let principalPayment = basePrincipalPerPeriod + extraPayment;

    if (principalPayment > balance) {
      principalPayment = balance;
    }

    const payment = principalPayment + interest;

    balance = Math.max(0, balance - principalPayment);
    totalInterest += interest;
    totalPaid += payment;

    schedule.push({
      period,
      payment,
      principal: principalPayment,
      interest,
      balance,
    });

    if (balance <= 0.01) {
      balance = 0;
      break;
    }
  }

  const payoffLabel = formatPayoffTime(period, paymentsPerYear);
  const firstPayment = schedule[0]?.payment ?? 0;
  const lastPayment = schedule[schedule.length - 1]?.payment ?? 0;

  return {
    schedule,
    summary: {
      paymentInfo: {
        type: METHODS.EQUAL_PRINCIPAL,
        firstPayment,
        lastPayment,
        extraPayment,
      },
      totalPaid,
      totalInterest,
      payoffLabel,
    },
  };
}

function updateSummary({ summary }) {
  const { paymentInfo, totalPaid, totalInterest, payoffLabel } = summary;

  let paymentText = "--";

  if (paymentInfo?.type === METHODS.AMORTIZED) {
    const { paymentPerPeriod, basePayment, extraPayment } = paymentInfo;
    const extra = extraPayment;
    paymentText =
      extra > 0.01
        ? `${formatterCurrency.format(paymentPerPeriod)}（含基础 ${formatterCurrency.format(
            basePayment
          )} + 额外 ${formatterCurrency.format(extraPayment)}）`
        : formatterCurrency.format(paymentPerPeriod);
  } else if (paymentInfo?.type === METHODS.EQUAL_PRINCIPAL) {
    const { firstPayment, lastPayment, extraPayment } = paymentInfo;
    if (Math.abs(firstPayment - lastPayment) < 0.01) {
      paymentText = formatterCurrency.format(firstPayment);
    } else {
      paymentText = `${formatterCurrency.format(
        firstPayment
      )} → ${formatterCurrency.format(lastPayment)}`;
    }

    if (extraPayment > 0.01) {
      paymentText += `（含每期额外 ${formatterCurrency.format(extraPayment)}）`;
    }
  } else if (paymentInfo?.type === METHODS.INTEREST_ONLY) {
    const { firstPayment, lastPayment, extraPayment } = paymentInfo;
    if (Math.abs(firstPayment - lastPayment) < 0.01) {
      paymentText = formatterCurrency.format(firstPayment);
    } else {
      paymentText = `${formatterCurrency.format(firstPayment)} → ${formatterCurrency.format(lastPayment)}`;
    }
    if (extraPayment > 0.01) {
      paymentText += `（含每期额外 ${formatterCurrency.format(extraPayment)}）`;
    }
  }

  paymentAmountEl.textContent = paymentText;
  totalPaidEl.textContent = formatterCurrency.format(totalPaid);
  totalInterestEl.textContent = formatterCurrency.format(totalInterest);
  payoffTimeEl.textContent = payoffLabel;
}

function calculateInterestOnlyLoan({
  principal,
  annualRate,
  years,
  paymentsPerYear,
  extraPayment,
}) {
  const periodicRate = annualRate > 0 ? annualRate / 100 / paymentsPerYear : 0;
  const totalPeriods = Math.max(1, Math.round(years * paymentsPerYear));
  // 计划为“每年末归还本金一次”
  const fullYears = Math.floor(totalPeriods / paymentsPerYear);
  const remainderPeriods = totalPeriods % paymentsPerYear;
  const annualRepaymentCount = Math.max(1, fullYears + (remainderPeriods > 0 ? 1 : 0));
  const plannedAnnualPrincipal = principal / annualRepaymentCount;

  const schedule = [];
  let balance = principal;
  let period = 0;
  let totalInterest = 0;
  let totalPaid = 0;

  const maxIterations = totalPeriods * 2 + 10;

  while (balance > 0 && period < maxIterations) {
    period += 1;
    const interest = periodicRate === 0 ? 0 : balance * periodicRate;

    const isEndOfYear = period % paymentsPerYear === 0;
    const isFinalPeriod = period === totalPeriods;

    // 每年最后一期按计划归还一笔本金；其他期只付利息（可叠加额外还款）
    let principalPaid = 0;
    if (isEndOfYear || isFinalPeriod) {
      principalPaid = Math.min(plannedAnnualPrincipal, balance);
    }

    if (extraPayment > 0 && balance - principalPaid > 0) {
      const extra = Math.min(extraPayment, balance - principalPaid);
      principalPaid += extra;
    }

    const payment = interest + principalPaid;
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
  const firstPayment = schedule[0]?.payment ?? 0;
  const lastPayment = schedule[schedule.length - 1]?.payment ?? 0;

  return {
    schedule,
    summary: {
      paymentInfo: {
        type: METHODS.INTEREST_ONLY,
        firstPayment,
        lastPayment,
        extraPayment,
      },
      totalPaid,
      totalInterest,
      payoffLabel,
    },
  };
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
