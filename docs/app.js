const ANALYSIS_DATE_LABEL = "March 27, 2026";
const PRIMARY_OUTCOME = "Glaucoma+Suspect vs Healthy";
const DOMAIN_CHOICES = ["AL-SIGHT+Hood", "AL-SIGHT", "Hood"];
const STRATA_CHOICES = ["Overall", "Male", "Female", "Age >= Median", "Age < Median", "White", "Black"];
const CLINICAL_STRATA_CHOICES = ["Case/Control", "Sex", "Race", "Age"];
const THRESHOLD_CHOICES = ["Youden", "90% Specificity", "95% Specificity", "99% Specificity"];

const DATA_FILES = {
  aucWithCi: "data/AUC_With_CI_03272026.csv",
  combinedPerformance: "data/Combined_Overall_Performance_03272026.csv",
  unimodalPerformance: "data/Unimodal_Overall_Performance_03272026.csv",
  multimodalPerformance: "data/Multimodal_Overall_Performance_03272026.csv",
  rocData: "data/ROC_Curve_Data_03272026.csv",
  unimodalDomain: "data/Unimodal_Domain_Performance_03272026.csv",
  multimodalDomain: "data/Multimodal_Domain_Performance_03272026.csv",
  unimodalStratified: "data/Unimodal_Stratified_Performance_03272026.csv",
  multimodalStratified: "data/Multimodal_Stratified_Performance_03272026.csv",
  unimodalDelong: "data/Unimodal_DeLong_Comparisons_03272026.csv",
  multimodalDelong: "data/Multimodal_DeLong_Comparisons_03272026.csv",
  unimodalConfusion: "data/Unimodal_Confusion_Matrices_03272026.csv",
  multimodalConfusion: "data/Multimodal_Confusion_Matrices_03272026.csv",
  demographics: "data/Demographics_Summary_03272026.csv",
  demographicsDomain: "data/Demographics_by_Domain_03272026.csv",
  demographicsCase: "data/Demographics_by_CaseControl_03272026.csv",
  clinicalMeasures: "data/Clinical_Measures_Summary_03272026.csv",
  clinicalStrata: "data/Clinical_Measures_by_Strata_03272026.csv",
  comparisonBaseline: "data/Comparison_With_3008_03272026.csv",
  domainSpecificOverall: "data/Domain_Specific_Overall_Performance_03272026.csv",
  domainSpecificConfusion: "data/Domain_Specific_Confusion_Matrices_03272026.csv",
  domainSpecificStratified: "data/Domain_Specific_Stratified_Performance_03272026.csv",
  domainSpecificDelong: "data/Domain_Specific_DeLong_Comparisons_03272026.csv",
  domainSpecificRoc: "data/Domain_Specific_ROC_Data_03272026.csv",
};

const COLORS = {
  unimodal: "#2f89bf",
  multimodal: "#7562d8",
  hood: "#d65a5a",
  alsight: "#2f89bf",
  green: "#1f9f73",
  orange: "#e08a2f",
  red: "#d65a5a",
  cyan: "#1bb4d1",
};

const app = {
  data: {},
  derived: {},
  tables: new Map(),
};

document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  setupNavigation();
  bindGenericPlotDownloads();

  try {
    const rawData = await loadAllData();
    app.data = normalizeData(rawData);
    app.derived = computeDerived(app.data);

    populateFilters();
    bindEvents();
    renderStaticMetadata();
    renderAll();

    document.getElementById("loading-state").classList.add("is-hidden");
    document.getElementById("app-shell").classList.remove("is-hidden");
  } catch (error) {
    showError(error);
  }
}

async function loadAllData() {
  const entries = await Promise.all(
    Object.entries(DATA_FILES).map(async ([key, path]) => [key, await loadCsv(path)])
  );

  return Object.fromEntries(entries);
}

async function loadCsv(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  const text = await response.text();
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: (header) => header ?? "",
  });

  return parsed.data.map((row) => {
    const cleaned = {};
    Object.entries(row).forEach(([key, value]) => {
      cleaned[key] = typeof value === "string" ? value.trim() : value;
    });
    return cleaned;
  });
}

function normalizeData(raw) {
  const unimodalStratified = raw.unimodalStratified.map((row) => ({
    ...row,
    Outcome: PRIMARY_OUTCOME,
    Model_Type: "Unimodal",
  }));

  const multimodalStratified = raw.multimodalStratified.map((row) => ({
    ...row,
    Outcome: PRIMARY_OUTCOME,
    Model_Type: "Multimodal",
  }));

  const unimodalDelong = normalizeDeLong(raw.unimodalDelong, "Unimodal");
  const multimodalDelong = normalizeDeLong(raw.multimodalDelong, "Multimodal");

  const confusionAll = [
    ...raw.unimodalConfusion.map((row) => ({ ...row, Model_Type: "Unimodal" })),
    ...raw.multimodalConfusion.map((row) => ({ ...row, Model_Type: "Multimodal" })),
  ];

  return {
    ...raw,
    unimodalStratified,
    multimodalStratified,
    delongAll: [...unimodalDelong, ...multimodalDelong],
    confusionAll,
  };
}

function normalizeDeLong(rows, modelType) {
  return rows
    .map((row) => {
      const normalized = { ...row };

      if (normalized.Model_1 !== undefined) normalized.Model1 = normalized.Model_1;
      if (normalized.Model_2 !== undefined) normalized.Model2 = normalized.Model_2;
      if (normalized.AUC_1 !== undefined) normalized.AUC1 = normalized.AUC_1;
      if (normalized.AUC_2 !== undefined) normalized.AUC2 = normalized.AUC_2;
      if (normalized.AUC_Difference !== undefined) normalized.AUC_Diff = normalized.AUC_Difference;

      normalized.Model_Type = normalized.Model_Type || modelType;
      normalized.AUC1 = asNumber(normalized.AUC1);
      normalized.AUC2 = asNumber(normalized.AUC2);
      normalized.AUC_Diff = asNumber(normalized.AUC_Diff);
      normalized.P_Value = asNumber(normalized.P_Value);
      normalized.Significant = normalized.Significant || "";

      return normalized;
    })
    .filter((row) => row.Model1 || row.Model2);
}

function computeDerived(data) {
  const bestUnimodal = maxBy(
    data.aucWithCi.filter((row) => row.Model_Type === "Unimodal" && row.Outcome === PRIMARY_OUTCOME),
    "AUC"
  );
  const bestMultimodal = maxBy(
    data.aucWithCi.filter((row) => row.Model_Type === "Multimodal" && row.Outcome === PRIMARY_OUTCOME),
    "AUC"
  );
  const bestOverall = maxBy(
    data.aucWithCi.filter((row) => row.Outcome === PRIMARY_OUTCOME),
    "AUC"
  );

  const overallDemographics = data.demographics.find((row) => row.Domain === "Overall") || {};

  return {
    bestUnimodal,
    bestMultimodal,
    bestOverall,
    alsightN: extractScalar(data.domainSpecificOverall, (row) => row.Domain === "AL-SIGHT" && row.Outcome === PRIMARY_OUTCOME, "N"),
    hoodN: extractScalar(data.domainSpecificOverall, (row) => row.Domain === "Hood" && row.Outcome === PRIMARY_OUTCOME, "N"),
    unimodalCount: uniqueValues(data.unimodalPerformance, "Model").length,
    multimodalCount: uniqueValues(data.multimodalPerformance, "Model").length,
    overallDemographics,
  };
}

function renderStaticMetadata() {
  document.getElementById("meta-analysis-date").textContent = ANALYSIS_DATE_LABEL;
  document.getElementById("meta-total-samples").textContent = formatInteger(app.derived.bestOverall?.N);
  document.getElementById("meta-total-cases").textContent = formatInteger(app.derived.bestOverall?.N_Cases);
  document.getElementById("meta-total-controls").textContent = formatInteger(app.derived.bestOverall?.N_Controls);
}

function populateFilters() {
  setSelectOptions("roc-domain", DOMAIN_CHOICES, "AL-SIGHT+Hood");
  setSelectOptions("roc-outcome", uniqueValues(app.data.rocData, "Outcome"), PRIMARY_OUTCOME);

  setSelectOptions("forest-domain", DOMAIN_CHOICES, "AL-SIGHT+Hood");
  setSelectOptions("forest-outcome", uniqueValues(app.data.aucWithCi, "Outcome"), PRIMARY_OUTCOME);

  setSelectOptions("clinical-stratification", CLINICAL_STRATA_CHOICES, "Case/Control");

  setSelectOptions("domain-filter", DOMAIN_CHOICES, "AL-SIGHT+Hood");
  setSelectOptions("domain-outcome", uniqueValues(app.data.unimodalDomain, "Outcome"), PRIMARY_OUTCOME);

  setSelectOptions("ds-domain", ["AL-SIGHT", "Hood"], "AL-SIGHT");
  setSelectOptions("ds-outcome", uniqueValues(app.data.domainSpecificOverall, "Outcome"), PRIMARY_OUTCOME);
  setSelectOptions("ds-stratum", STRATA_CHOICES, "Overall");

  setSelectOptions("strat-domain", DOMAIN_CHOICES, "AL-SIGHT+Hood");
  setSelectOptions("strat-stratum", STRATA_CHOICES, "Overall");

  setSelectOptions("delong-domain", DOMAIN_CHOICES, "AL-SIGHT+Hood");
  setSelectOptions("delong-outcome", uniqueValues(app.data.delongAll, "Outcome"), PRIMARY_OUTCOME);

  setSelectOptions("cm-domain", DOMAIN_CHOICES, "AL-SIGHT+Hood");
  setSelectOptions("cm-outcome", uniqueValues(app.data.confusionAll, "Outcome"), PRIMARY_OUTCOME);
  setSelectOptions("cm-threshold", THRESHOLD_CHOICES, "Youden");

  setSelectOptions("te-domain", DOMAIN_CHOICES, "AL-SIGHT+Hood");
  setSelectOptions("te-outcome", uniqueValues(app.data.rocData, "Outcome"), PRIMARY_OUTCOME);

  refreshRocModelOptions();
  refreshThresholdModelOptions(true);
}

function bindEvents() {
  bindSelect("roc-domain", () => {
    refreshRocModelOptions();
    renderRoc();
  });
  bindSelect("roc-outcome", () => {
    refreshRocModelOptions();
    renderRoc();
  });
  bindRadioGroup("roc-model-type", () => {
    refreshRocModelOptions();
    renderRoc();
  });
  document.getElementById("roc-models").addEventListener("change", () => renderRoc());
  document.getElementById("roc-select-all").addEventListener("click", () => {
    setAllCheckboxes("roc-models", true);
    renderRoc();
  });
  document.getElementById("roc-deselect-all").addEventListener("click", () => {
    setAllCheckboxes("roc-models", false);
    renderRoc();
  });

  bindSelect("forest-domain", renderForest);
  bindSelect("forest-outcome", renderForest);
  bindRadioGroup("forest-model-type", renderForest);
  document.getElementById("forest-sort").addEventListener("change", renderForest);

  bindSelect("clinical-stratification", renderClinical);

  bindSelect("domain-filter", renderDomainPerformance);
  bindSelect("domain-outcome", renderDomainPerformance);
  bindRadioGroup("domain-model-type", renderDomainPerformance);

  bindSelect("ds-domain", renderDomainSpecific);
  bindSelect("ds-outcome", renderDomainSpecific);
  bindSelect("ds-stratum", renderDomainSpecific);
  bindRadioGroup("ds-model-type", renderDomainSpecific);

  bindSelect("strat-domain", renderStratified);
  bindSelect("strat-stratum", renderStratified);
  bindRadioGroup("strat-model-type", renderStratified);

  bindSelect("delong-domain", renderDelong);
  bindSelect("delong-outcome", renderDelong);
  bindRadioGroup("delong-model-type", renderDelong);
  document.getElementById("delong-significant-only").addEventListener("change", renderDelong);

  bindSelect("cm-domain", renderConfusion);
  bindSelect("cm-outcome", renderConfusion);
  bindSelect("cm-threshold", renderConfusion);
  bindRadioGroup("cm-model-type", renderConfusion);

  bindSelect("te-domain", () => {
    refreshThresholdModelOptions(true);
    renderThresholdExplorer();
  });
  bindSelect("te-outcome", () => {
    refreshThresholdModelOptions(true);
    renderThresholdExplorer();
  });
  bindSelect("te-model", () => {
    applyThresholdPreset("Youden");
    renderThresholdExplorer();
  });
  document.getElementById("te-threshold").addEventListener("input", () => {
    updateThresholdDisplay();
    renderThresholdExplorer();
  });
  document.getElementById("te-youden").addEventListener("click", () => applyThresholdPreset("Youden"));
  document.getElementById("te-spec90").addEventListener("click", () => applyThresholdPreset("90% Specificity"));
  document.getElementById("te-spec95").addEventListener("click", () => applyThresholdPreset("95% Specificity"));
  document.getElementById("te-spec99").addEventListener("click", () => applyThresholdPreset("99% Specificity"));

  bindCsvDownload("summary-download-data", () => getSummaryTopModelsRaw(), () => "summary_top_models.csv");
  bindCsvDownload("roc-download-data", () => getCurrentRocRows(), () => filenameFromParts("roc_curves", getValue("roc-domain"), getValue("roc-outcome")));
  bindCsvDownload("forest-download-data", () => getForestRows(), () => filenameFromParts("forest_plot", getValue("forest-domain"), getValue("forest-outcome")));
  bindCsvDownload("demographics-download-overall", () => app.data.demographics, () => "demographics_overall.csv");
  bindCsvDownload("demographics-download-domain", () => app.data.demographicsDomain, () => "demographics_by_domain.csv");
  bindCsvDownload("demographics-download-case", () => app.data.demographicsCase, () => "demographics_by_case_control.csv");
  bindCsvDownload("clinical-download-summary", () => app.data.clinicalMeasures, () => "clinical_measures_summary.csv");
  bindCsvDownload("clinical-download-strata", () => getClinicalStrataRows(), () => filenameFromParts("clinical_strata", getValue("clinical-stratification")));
  bindCsvDownload("domain-download-data", () => getDomainRows(), () => filenameFromParts("domain_performance", getValue("domain-filter"), getValue("domain-outcome")));
  bindCsvDownload("ds-download-data", () => getDomainSpecificDownloadRows(), () => filenameFromParts("domain_specific", getValue("ds-domain"), getValue("ds-outcome")));
  bindCsvDownload("strat-download-data", () => getStratifiedRows(), () => filenameFromParts("stratified", getValue("strat-domain"), getRadioValue("strat-model-type")));
  bindCsvDownload("delong-download-data", () => getDelongRows(), () => filenameFromParts("auc_comparisons", getValue("delong-domain"), getValue("delong-outcome")));
  bindCsvDownload("cm-download-data", () => getConfusionRows(), () => filenameFromParts("confusion_matrices", getValue("cm-domain"), getValue("cm-threshold")));
  bindCsvDownload("baseline-download-data", () => app.data.comparisonBaseline, () => "comparison_with_3008.csv");
}

function renderAll() {
  renderSummary();
  renderRoc();
  renderForest();
  renderDemographics();
  renderClinical();
  renderDomainPerformance();
  renderDomainSpecific();
  renderStratified();
  renderDelong();
  renderConfusion();
  renderThresholdExplorer();
  renderBaselineComparison();
}

function renderSummary() {
  const bestOverall = app.derived.bestOverall || {};
  const bestUnimodal = app.derived.bestUnimodal || {};
  const bestMultimodal = app.derived.bestMultimodal || {};

  setText("summary-best-overall-value", formatFixed(bestOverall.AUC, 3));
  setText("summary-best-overall-label", bestOverall.Model || "-");
  setText("summary-best-unimodal-value", formatFixed(bestUnimodal.AUC, 3));
  setText("summary-best-unimodal-label", bestUnimodal.Model || "-");
  setText("summary-best-multimodal-value", formatFixed(bestMultimodal.AUC, 3));
  setText("summary-best-multimodal-label", bestMultimodal.Model || "-");

  const quickStats = [
    {
      label: "Total",
      value: formatInteger(bestOverall.N),
      detail: "",
    },
    {
      label: "AL-SIGHT",
      value: `${formatInteger(app.derived.alsightN)} (${formatPct((app.derived.alsightN || 0) / (bestOverall.N || 1), 1)})`,
      detail: "",
    },
    {
      label: "Hood",
      value: `${formatInteger(app.derived.hoodN)} (${formatPct((app.derived.hoodN || 0) / (bestOverall.N || 1), 1)})`,
      detail: "",
    },
    {
      label: "Cases",
      value: `${formatInteger(bestOverall.N_Cases)} (${formatPct((bestOverall.N_Cases || 0) / (bestOverall.N || 1), 1)})`,
      detail: "",
    },
    {
      label: "Controls",
      value: `${formatInteger(bestOverall.N_Controls)} (${formatPct((bestOverall.N_Controls || 0) / (bestOverall.N || 1), 1)})`,
      detail: "",
    },
    {
      label: "Models Evaluated",
      value: `${app.derived.unimodalCount} unimodal / ${app.derived.multimodalCount} multimodal`,
      detail: "",
    },
  ];
  renderStatStack("summary-quick-stats", quickStats);

  const topModels = getSummaryTopModelsRaw();
  renderTable(
    "summary-top-models-table",
    topModels.map((row) => ({
      Model: row.Model,
      "Model Type": row.Model_Type,
      "AUC (95% CI)": formatAucCi(row, "AUC", "AUC_Lower", "AUC_Upper"),
    })),
    { paginationSize: 5 }
  );

  const sensitivityRows = app.data.confusionAll
    .filter((row) => row.Outcome === PRIMARY_OUTCOME && row.Threshold_Type === "95% Specificity")
    .sort((a, b) => (b.Sensitivity || 0) - (a.Sensitivity || 0))
    .slice(0, 5)
    .map((row) => ({
      Model: row.Model,
      "Model Type": row.Model_Type,
      Sensitivity: formatPct(row.Sensitivity, 1),
      Specificity: formatPct(row.Specificity, 1),
    }));
  renderTable("summary-sensitivity-table", sensitivityRows, { paginationSize: 5 });

  const summaryModels = uniqueValues(topModels, "Model");
  const traces = summaryModels.map((model, index) => {
    const rows = app.data.rocData.filter((row) => row.Outcome === PRIMARY_OUTCOME && row.Model === model);
    const aucRow = topModels.find((row) => row.Model === model) || {};

    return {
      type: "scatter",
      mode: "lines",
      name: `${model} (AUC=${formatFixed(aucRow.AUC, 3)})`,
      x: rows.map((row) => asNumber(row.FPR)),
      y: rows.map((row) => asNumber(row.Sensitivity)),
      line: {
        width: 3,
        color: ["#d65a5a", "#2f89bf", "#1f9f73", "#7562d8", "#e08a2f"][index % 5],
      },
      hovertemplate:
        "<b>%{fullData.name}</b><br>False Positive Rate: %{x:.3f}<br>Sensitivity: %{y:.3f}<extra></extra>",
    };
  });

  traces.push(referenceLine());
  renderPlot("summary-roc-plot", traces, baseRocLayout("Top models", PRIMARY_OUTCOME));
  setPlotDownloadName("summary-download-plot", "summary_top_models_roc");
}

function renderRoc() {
  const selectedModels = getCheckedValues("roc-models");
  const currentRows = getCurrentRocRows();

  if (!selectedModels.length || !currentRows.length) {
    renderEmptyPlot("roc-plot", "Select at least one model to display ROC curves.");
    renderTable("roc-auc-table", []);
    return;
  }

  const aucSource = getAucSourceForDomain(getValue("roc-domain"));
  const traces = selectedModels.map((model, index) => {
    const rows = currentRows.filter((row) => row.Model === model);
    const aucRow = aucSource.find((row) => row.Outcome === getValue("roc-outcome") && row.Model === model) || {};
    return {
      type: "scatter",
      mode: "lines",
      name: `${model} (AUC=${formatFixed(aucRow.AUC, 3)})`,
      x: rows.map((row) => asNumber(row.FPR)),
      y: rows.map((row) => asNumber(row.Sensitivity)),
      line: { width: 2.5, color: paletteColor(index) },
      hovertemplate:
        "<b>%{fullData.name}</b><br>Specificity: %{customdata[0]:.3f}<br>Sensitivity: %{y:.3f}<br>Threshold: %{customdata[1]}<extra></extra>",
      customdata: rows.map((row) => [
        asNumber(row.Specificity ?? 1 - row.FPR),
        isFiniteNumber(row.Threshold) ? formatFixed(row.Threshold, 4) : "NA",
      ]),
    };
  });

  traces.push(referenceLine());
  renderPlot(
    "roc-plot",
    traces,
    baseRocLayout(getValue("roc-domain"), getValue("roc-outcome"))
  );
  setPlotDownloadName("roc-download-plot", filenameFromParts("roc_curves", getValue("roc-domain"), getValue("roc-outcome")).replace(".csv", ""));

  const aucRows = aucSource
    .filter((row) => row.Outcome === getValue("roc-outcome") && selectedModels.includes(row.Model))
    .sort((a, b) => (b.AUC || 0) - (a.AUC || 0))
    .map((row) => ({
      Model: row.Model,
      "Model Type": row.Model_Type,
      AUC: formatFixed(row.AUC, 4),
      "AUC Lower": formatFixed(getCiLower(row), 4),
      "AUC Upper": formatFixed(getCiUpper(row), 4),
    }));
  renderTable("roc-auc-table", aucRows);
}

function renderForest() {
  const rows = getForestRows();
  if (!rows.length) {
    renderEmptyPlot("forest-plot", "No forest plot data available for the current filters.");
    renderTable("forest-table", []);
    return;
  }

  const traces = ["Unimodal", "Multimodal"]
    .filter((type) => rows.some((row) => row.Model_Type === type))
    .map((type) => {
      const subset = rows.filter((row) => row.Model_Type === type);
      return {
        type: "scatter",
        mode: "markers",
        name: type,
        x: subset.map((row) => asNumber(row.AUC)),
        y: subset.map((row) => row.Model),
        error_x: {
          type: "data",
          symmetric: false,
          array: subset.map((row) => Math.max(0, getCiUpper(row) - asNumber(row.AUC))),
          arrayminus: subset.map((row) => Math.max(0, asNumber(row.AUC) - getCiLower(row))),
          thickness: 1.3,
          width: 0,
        },
        marker: {
          size: 11,
          color: type === "Unimodal" ? COLORS.unimodal : COLORS.multimodal,
        },
        hovertemplate:
          "<b>%{y}</b><br>AUC: %{x:.3f}<br>95% CI: %{customdata[0]}<extra></extra>",
        customdata: subset.map((row) => [formatAucCi(row, "AUC", null, null)]),
      };
    });

  renderPlot("forest-plot", traces, {
    ...basePlotLayout(),
    title: {
      text: `${escapeHtml(getValue("forest-domain"))} - ${escapeHtml(getValue("forest-outcome"))}`,
      x: 0.01,
      xanchor: "left",
    },
    xaxis: {
      title: { text: "AUC (95% CI)" },
      range: [getValue("forest-domain") === "Hood" ? 0.3 : 0.5, 1.0],
      zeroline: false,
    },
    yaxis: { automargin: true, categoryorder: "array", categoryarray: rows.map((row) => row.Model) },
    legend: { orientation: "h", x: 0, y: -0.22 },
    margin: { l: 160, r: 20, t: 55, b: 70 },
  });
  setPlotDownloadName("forest-download-plot", filenameFromParts("forest_plot", getValue("forest-domain"), getValue("forest-outcome")).replace(".csv", ""));

  renderTable(
    "forest-table",
    rows
      .slice()
      .sort((a, b) => (b.AUC || 0) - (a.AUC || 0))
      .map((row) => ({
        Model: row.Model,
        "Model Type": row.Model_Type,
        "AUC (95% CI)": formatAucCi(row, "AUC", "AUC_Lower", "AUC_Upper"),
        N: formatInteger(row.N),
        Cases: formatInteger(row.N_Cases),
        Controls: formatInteger(row.N_Controls),
      }))
  );
}

function renderDemographics() {
  renderTable("demographics-overall-table", app.data.demographics);
  renderTable("demographics-domain-table", app.data.demographicsDomain);
  renderTable("demographics-case-table", app.data.demographicsCase);
}

function renderClinical() {
  renderTable("clinical-summary-table", app.data.clinicalMeasures);
  renderTable("clinical-strata-table", getClinicalStrataRows());
}

function renderDomainPerformance() {
  const rows = getDomainRows();
  if (!rows.length) {
    renderEmptyPlot("domain-plot", "No domain performance data available for the current filters.");
    renderTable("domain-table", []);
    return;
  }

  const traces =
    getValue("domain-filter") === "AL-SIGHT+Hood"
      ? ["AL-SIGHT", "Hood"]
          .filter((domain) => rows.some((row) => row.Domain === domain))
          .map((domain) => {
            const subset = rows.filter((row) => row.Domain === domain);
            return {
              type: "bar",
              orientation: "h",
              name: domain,
              x: subset.map((row) => asNumber(row.AUC)),
              y: subset.map((row) => row.Model),
              marker: { color: domain === "AL-SIGHT" ? COLORS.alsight : COLORS.hood },
              hovertemplate: "<b>%{y}</b><br>AUC: %{x:.3f}<br>Domain: %{fullData.name}<extra></extra>",
            };
          })
      : [
          {
            type: "bar",
            orientation: "h",
            x: rows.map((row) => asNumber(row.AUC)),
            y: rows.map((row) => row.Model),
            marker: { color: rows.map((_, index) => paletteColor(index)) },
            hovertemplate: "<b>%{y}</b><br>AUC: %{x:.3f}<extra></extra>",
            showlegend: false,
          },
        ];

  renderPlot("domain-plot", traces, {
    ...basePlotLayout(),
    title: {
      text: `${escapeHtml(getValue("domain-filter"))} - ${escapeHtml(getValue("domain-outcome"))}`,
      x: 0.01,
      xanchor: "left",
    },
    barmode: getValue("domain-filter") === "AL-SIGHT+Hood" ? "group" : "stack",
    xaxis: { title: { text: "AUC" }, range: [0, 1] },
    yaxis: { automargin: true },
    legend: { orientation: "h", x: 0, y: -0.2 },
    margin: { l: 170, r: 20, t: 55, b: 70 },
  });
  setPlotDownloadName("domain-download-plot", filenameFromParts("domain_performance", getValue("domain-filter"), getValue("domain-outcome")).replace(".csv", ""));

  renderTable(
    "domain-table",
    rows.map((row) => ({
      Domain: row.Domain,
      Model: row.Model,
      AUC: formatFixed(row.AUC, 3),
      "95% CI": formatAucCi(row, "AUC", "AUC_CI_Lower", "AUC_CI_Upper"),
      AUPRC: formatFixed(row.AUPRC, 3),
      N: formatInteger(row.N),
      Cases: formatInteger(row.N_Cases),
      Controls: formatInteger(row.N_Controls),
      "Sens @ 90% Spec": formatPct(row.Sens_90Spec, 1),
      "Sens @ 95% Spec": formatPct(row.Sens_95Spec, 1),
    }))
  );
}

function renderDomainSpecific() {
  const rows = getDomainSpecificPerformanceRows();
  const domain = getValue("ds-domain");
  const outcome = getValue("ds-outcome");

  if (!rows.length) {
    renderEmptyPlot("ds-auc-plot", "No domain-specific performance rows available.");
    renderTable("ds-performance-table", []);
  } else {
    const traces = ["Unimodal", "Multimodal"]
      .filter((type) => rows.some((row) => row.Model_Type === type))
      .map((type) => {
        const subset = rows.filter((row) => row.Model_Type === type).slice().sort((a, b) => (a.AUC || 0) - (b.AUC || 0));
        return {
          type: "scatter",
          mode: "markers",
          name: type,
          x: subset.map((row) => asNumber(row.AUC)),
          y: subset.map((row) => row.Model),
          error_x: {
            type: "data",
            symmetric: false,
            array: subset.map((row) => Math.max(0, getCiUpper(row) - asNumber(row.AUC))),
            arrayminus: subset.map((row) => Math.max(0, asNumber(row.AUC) - getCiLower(row))),
            thickness: 1.3,
            width: 0,
          },
          marker: {
            size: 12,
            color: type === "Unimodal" ? COLORS.unimodal : COLORS.multimodal,
          },
          hovertemplate: "<b>%{y}</b><br>AUC: %{x:.3f}<extra></extra>",
        };
      });

    renderPlot("ds-auc-plot", traces, {
      ...basePlotLayout(),
      title: { text: `${escapeHtml(domain)} - ${escapeHtml(outcome)}`, x: 0.01, xanchor: "left" },
      xaxis: { title: { text: "AUC" }, range: [0.5, 1.0] },
      yaxis: { automargin: true },
      legend: { orientation: "h", x: 0, y: -0.24 },
      margin: { l: 170, r: 20, t: 55, b: 80 },
    });

    renderTable(
      "ds-performance-table",
      rows.map((row) => ({
        Model: row.Model,
        "Model Type": row.Model_Type,
        AUC: formatFixed(row.AUC, 3),
        "AUC Lower": formatFixed(row.AUC_CI_Lower, 3),
        "AUC Upper": formatFixed(row.AUC_CI_Upper, 3),
        AUPRC: formatFixed(row.AUPRC, 3),
        N: formatInteger(row.N),
        Cases: formatInteger(row.N_Cases),
      }))
    );
  }
  setPlotDownloadName("ds-download-plot", filenameFromParts("domain_specific_auc", domain, outcome).replace(".csv", ""));

  const confusionRows = app.data.domainSpecificConfusion
    .filter((row) => row.Domain === domain && row.Outcome === outcome && row.Threshold_Type === "Youden")
    .filter((row) => {
      const modelType = getRadioValue("ds-model-type");
      return modelType === "All" || row.Model_Type === modelType;
    })
    .map((row) => ({
      Model: row.Model,
      TP: formatInteger(row.TP),
      TN: formatInteger(row.TN),
      FP: formatInteger(row.FP),
      FN: formatInteger(row.FN),
      Sensitivity: formatPct(row.Sensitivity, 1),
      Specificity: formatPct(row.Specificity, 1),
      PPV: formatPct(row.PPV, 1),
      NPV: formatPct(row.NPV, 1),
      Accuracy: formatPct(row.Accuracy, 1),
    }));
  renderTable("ds-confusion-table", confusionRows);

  const stratifiedRows = app.data.domainSpecificStratified
    .filter((row) => row.Domain === domain && row.Stratum === getValue("ds-stratum"))
    .filter((row) => {
      const modelType = getRadioValue("ds-model-type");
      return modelType === "All" || row.Model_Type === modelType;
    })
    .map((row) => ({
      Model: row.Model,
      "Model Type": row.Model_Type,
      N: formatInteger(row.N),
      Cases: formatInteger(row.N_Cases),
      AUC: formatFixed(row.AUC, 3),
      AUPRC: formatFixed(row.AUPRC, 3),
    }));
  renderTable("ds-stratified-table", stratifiedRows);

  const dsDelongRows = app.data.domainSpecificDelong
    .filter((row) => row.Domain === domain && row.Outcome === outcome)
    .filter((row) => {
      const modelType = getRadioValue("ds-model-type");
      return modelType === "All" || row.Model_Type === modelType;
    })
    .map((row) => ({
      "Model 1": row.Model1,
      "Model 2": row.Model2,
      AUC1: formatFixed(row.AUC1, 4),
      AUC2: formatFixed(row.AUC2, 4),
      "AUC Diff": formatFixed(row.AUC_Diff, 4),
      "P Value": formatFixed(row.P_Value, 4),
      Significant: row.Significant,
      Method: row.Method,
    }));
  renderTable("ds-delong-table", dsDelongRows);
}

function renderStratified() {
  const rows = getStratifiedRows();
  const stratum = getValue("strat-stratum");
  const plotRows = rows.filter((row) => row.Stratum === stratum);

  if (!plotRows.length) {
    renderEmptyPlot("stratified-plot", "No stratified rows available for the current selection.");
  } else {
    renderPlot(
      "stratified-plot",
      [
        {
          type: "bar",
          orientation: "h",
          x: plotRows.map((row) => asNumber(row.AUC)),
          y: plotRows.map((row) => row.Model),
          marker: { color: plotRows.map((_, index) => paletteColor(index)) },
          hovertemplate: "<b>%{y}</b><br>AUC: %{x:.3f}<extra></extra>",
          showlegend: false,
        },
      ],
      {
        ...basePlotLayout(),
        title: {
          text: `${escapeHtml(getValue("strat-domain"))} - Stratum: ${escapeHtml(stratum)}`,
          x: 0.01,
          xanchor: "left",
        },
        xaxis: { title: { text: "AUC" }, range: [0, 1] },
        yaxis: { automargin: true },
        margin: { l: 170, r: 20, t: 55, b: 60 },
      }
    );
  }
  setPlotDownloadName("strat-download-plot", filenameFromParts("stratified_performance", getValue("strat-domain"), stratum).replace(".csv", ""));

  renderTable(
    "stratified-table",
    rows.map((row) => ({
      Model: row.Model,
      Stratum: row.Stratum,
      N: formatInteger(row.N),
      Cases: formatInteger(row.N_Cases),
      Controls: formatInteger(row.N_Controls),
      AUC: formatFixed(row.AUC, 3),
      "AUC Formatted": row.AUC_Formatted,
      AUPRC: formatFixed(row.AUPRC, 3),
    }))
  );
}

function renderDelong() {
  const rows = getDelongRows();
  renderTable(
    "delong-table",
    rows.map((row) => ({
      "Model 1": row.Model1,
      "Model 2": row.Model2,
      AUC1: formatFixed(row.AUC1, 4),
      AUC2: formatFixed(row.AUC2, 4),
      "AUC Diff": formatFixed(row.AUC_Diff ?? row.AUC1 - row.AUC2, 4),
      "P Value": formatFixed(row.P_Value, 4),
      Significant: row.Significant,
      Method: row.Method || "",
    }))
  );
}

function renderConfusion() {
  const rows = getConfusionRows();
  if (!rows.length) {
    renderTable("confusion-table", []);
    renderEmptyPlot("confusion-plot", "No confusion matrix rows available for the current filters.");
    return;
  }

  renderTable(
    "confusion-table",
    rows.map((row) => ({
      Model: row.Model,
      TP: formatInteger(row.TP),
      TN: formatInteger(row.TN),
      FP: formatInteger(row.FP),
      FN: formatInteger(row.FN),
      Sensitivity: formatPct(row.Sensitivity, 1),
      Specificity: formatPct(row.Specificity, 1),
      PPV: formatPct(row.PPV, 1),
      NPV: formatPct(row.NPV, 1),
      Accuracy: formatPct(row.Accuracy, 1),
      Threshold: formatFixed(row.Threshold, 4),
    }))
  );

  const traces = [
    {
      type: "bar",
      orientation: "h",
      name: "Sensitivity",
      x: rows.map((row) => asNumber(row.Sensitivity)),
      y: rows.map((row) => row.Model),
      marker: { color: COLORS.green },
      hovertemplate: "<b>%{y}</b><br>Sensitivity: %{x:.3f}<extra></extra>",
    },
    {
      type: "bar",
      orientation: "h",
      name: "Specificity",
      x: rows.map((row) => asNumber(row.Specificity)),
      y: rows.map((row) => row.Model),
      marker: { color: COLORS.unimodal },
      hovertemplate: "<b>%{y}</b><br>Specificity: %{x:.3f}<extra></extra>",
    },
  ];

  renderPlot("confusion-plot", traces, {
    ...basePlotLayout(),
    title: {
      text: `${escapeHtml(getValue("cm-domain"))} - ${escapeHtml(getValue("cm-threshold"))}`,
      x: 0.01,
      xanchor: "left",
    },
    barmode: "group",
    xaxis: { title: { text: "Value" }, range: [0, 1], tickformat: ".0%" },
    yaxis: { automargin: true },
    legend: { orientation: "h", x: 0, y: -0.2 },
    margin: { l: 170, r: 20, t: 55, b: 70 },
  });
  setPlotDownloadName("cm-download-plot", filenameFromParts("confusion_plot", getValue("cm-domain"), getValue("cm-threshold")).replace(".csv", ""));
}

function renderThresholdExplorer() {
  updateThresholdDisplay();

  const rocRows = getThresholdRocRows();
  if (!rocRows.length) {
    renderEmptyPlot("te-roc-plot", "No ROC rows available for the selected threshold explorer inputs.");
    renderEmptyPlot("te-tradeoff-plot", "No trade-off data available.");
    renderTable("te-metrics-table", []);
    ["te-tp", "te-fp", "te-fn", "te-tn"].forEach((id) => setText(id, "-"));
    return;
  }

  const metrics = computeThresholdMetrics(rocRows);
  setText("te-tp", formatInteger(metrics.TP));
  setText("te-fp", formatInteger(metrics.FP));
  setText("te-fn", formatInteger(metrics.FN));
  setText("te-tn", formatInteger(metrics.TN));

  renderTable("te-metrics-table", [
    { Metric: "Threshold", Value: formatFixed(metrics.Threshold, 4) },
    { Metric: "Sensitivity", Value: formatPct(metrics.Sensitivity, 1) },
    { Metric: "Specificity", Value: formatPct(metrics.Specificity, 1) },
    { Metric: "PPV", Value: formatPct(metrics.PPV, 1) },
    { Metric: "NPV", Value: formatPct(metrics.NPV, 1) },
    { Metric: "Accuracy", Value: formatPct(metrics.Accuracy, 1) },
  ], { pagination: false });

  const currentPoint = {
    x: 1 - metrics.Specificity,
    y: metrics.Sensitivity,
  };

  renderPlot(
    "te-roc-plot",
    [
      {
        type: "scatter",
        mode: "lines",
        name: getValue("te-model"),
        x: rocRows.map((row) => asNumber(row.FPR)),
        y: rocRows.map((row) => asNumber(row.Sensitivity)),
        line: { color: COLORS.unimodal, width: 3 },
        hovertemplate: "FPR: %{x:.3f}<br>Sensitivity: %{y:.3f}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "markers",
        name: "Current threshold",
        x: [currentPoint.x],
        y: [currentPoint.y],
        marker: { color: COLORS.red, size: 12 },
        hovertemplate: "Current threshold<br>FPR: %{x:.3f}<br>Sensitivity: %{y:.3f}<extra></extra>",
      },
      referenceLine(),
    ],
    {
      ...baseRocLayout(getValue("te-model"), `Threshold ${formatFixed(metrics.Threshold, 4)}`),
      annotations: [
        {
          text: `Sens ${formatPct(metrics.Sensitivity, 1)} | Spec ${formatPct(metrics.Specificity, 1)}`,
          x: 0.7,
          y: 0.15,
          xref: "paper",
          yref: "paper",
          showarrow: false,
          bgcolor: "rgba(255,255,255,0.85)",
          bordercolor: "rgba(24,34,51,0.12)",
          borderpad: 6,
          font: { color: "#182233", size: 12 },
        },
      ],
    }
  );
  setPlotDownloadName("te-download-roc-plot", filenameFromParts("threshold_roc", getValue("te-domain"), getValue("te-model")).replace(".csv", ""));

  renderPlot(
    "te-tradeoff-plot",
    [
      {
        type: "scatter",
        mode: "lines",
        name: "Sensitivity",
        x: rocRows.map((row) => asNumber(row.Threshold)),
        y: rocRows.map((row) => asNumber(row.Sensitivity)),
        line: { color: COLORS.green, width: 3 },
      },
      {
        type: "scatter",
        mode: "lines",
        name: "Specificity",
        x: rocRows.map((row) => asNumber(row.Threshold)),
        y: rocRows.map((row) => asNumber(row.Specificity)),
        line: { color: COLORS.unimodal, width: 3 },
      },
    ],
    {
      ...basePlotLayout(),
      title: { text: "Sensitivity-Specificity Trade-off", x: 0.01, xanchor: "left" },
      xaxis: { title: { text: "Probability Threshold" }, range: [0, 1] },
      yaxis: { title: { text: "Value" }, range: [0, 1], tickformat: ".0%" },
      shapes: [
        {
          type: "line",
          x0: metrics.Threshold,
          x1: metrics.Threshold,
          y0: 0,
          y1: 1,
          yref: "paper",
          line: { color: COLORS.red, width: 2, dash: "dash" },
        },
      ],
      legend: { orientation: "h", x: 0, y: -0.2 },
      margin: { l: 70, r: 20, t: 55, b: 70 },
    }
  );
  setPlotDownloadName("te-download-tradeoff-plot", filenameFromParts("threshold_tradeoff", getValue("te-domain"), getValue("te-model")).replace(".csv", ""));
}

function renderBaselineComparison() {
  renderTable(
    "baseline-table",
    app.data.comparisonBaseline.map((row) => ({
      Outcome: row.Outcome,
      Model: row.Model,
      "Topcon N": formatInteger(row.Topcon_N),
      "Baseline 3008 N": formatInteger(row.Baseline_3008_N),
      "Topcon Cases": formatInteger(row.Topcon_Cases),
      "Baseline 3008 Cases": formatInteger(row.Baseline_3008_Cases),
      "Topcon Controls": formatInteger(row.Topcon_Controls),
      "Baseline 3008 Controls": formatInteger(row.Baseline_3008_Controls),
      "Topcon AUC": formatFixed(row.Topcon_AUC, 4),
      "Baseline 3008 AUC": formatFixed(row.Baseline_3008_AUC, 4),
      "AUC Diff": formatFixed(row.AUC_Diff, 4),
      "Topcon AUPRC": formatFixed(row.Topcon_AUPRC, 3),
      "Baseline 3008 AUPRC": formatFixed(row.Baseline_3008_AUPRC, 3),
      "AUPRC Diff": formatFixed(row.AUPRC_Diff, 3),
      "Topcon Sens @90": formatFixed(row.Topcon_Sens90, 3),
      "Baseline Sens @90": formatFixed(row.Baseline_3008_Sens90, 3),
      "Sens @90 Diff": formatFixed(row.Sens90_Diff, 3),
      "Topcon Sens @95": formatFixed(row.Topcon_Sens95, 3),
      "Baseline Sens @95": formatFixed(row.Baseline_3008_Sens95, 3),
      "Sens @95 Diff": formatFixed(row.Sens95_Diff, 3),
    })),
    {
      paginationSize: 10,
      layout: "fitDataTable",
    }
  );
}

function getSummaryTopModelsRaw() {
  return app.data.aucWithCi
    .filter((row) => row.Outcome === PRIMARY_OUTCOME)
    .slice()
    .sort((a, b) => (b.AUC || 0) - (a.AUC || 0))
    .slice(0, 5);
}

function getRocSourceForDomain(domain) {
  return domain === "AL-SIGHT+Hood"
    ? app.data.rocData
    : app.data.domainSpecificRoc.filter((row) => row.Domain === domain);
}

function getAucSourceForDomain(domain) {
  return domain === "AL-SIGHT+Hood"
    ? app.data.aucWithCi
    : app.data.domainSpecificOverall.map((row) => ({
        ...row,
        AUC_Lower: row.AUC_CI_Lower,
        AUC_Upper: row.AUC_CI_Upper,
      })).filter((row) => row.Domain === domain);
}

function getCurrentRocRows() {
  const selectedModels = getCheckedValues("roc-models");
  return getRocSourceForDomain(getValue("roc-domain")).filter(
    (row) => row.Outcome === getValue("roc-outcome") && selectedModels.includes(row.Model)
  );
}

function getForestRows() {
  let rows = getAucSourceForDomain(getValue("forest-domain")).filter(
    (row) => row.Outcome === getValue("forest-outcome")
  );

  const modelType = getRadioValue("forest-model-type");
  if (modelType !== "All") {
    rows = rows.filter((row) => row.Model_Type === modelType);
  }

  rows = rows.slice();
  rows.sort((a, b) => {
    if (document.getElementById("forest-sort").checked) {
      return (a.AUC || 0) - (b.AUC || 0);
    }
    return 0;
  });
  return rows;
}

function getClinicalStrataRows() {
  return app.data.clinicalStrata.filter((row) => row.Stratification === getValue("clinical-stratification"));
}

function getDomainRows() {
  const modelType = getRadioValue("domain-model-type");
  const source = modelType === "Unimodal" ? app.data.unimodalDomain : app.data.multimodalDomain;
  const outcome = getValue("domain-outcome");
  const domainFilter = getValue("domain-filter");

  let rows = source.filter((row) => row.Outcome === outcome);
  if (domainFilter === "AL-SIGHT+Hood") {
    rows = rows.filter((row) => row.Domain !== "Overall");
  } else {
    rows = rows.filter((row) => row.Domain === domainFilter);
  }
  return rows;
}

function getDomainSpecificPerformanceRows() {
  const rows = app.data.domainSpecificOverall.filter(
    (row) => row.Domain === getValue("ds-domain") && row.Outcome === getValue("ds-outcome")
  );
  const modelType = getRadioValue("ds-model-type");
  return modelType === "All" ? rows : rows.filter((row) => row.Model_Type === modelType);
}

function getDomainSpecificDownloadRows() {
  return getDomainSpecificPerformanceRows();
}

function getStratifiedRows() {
  const domain = getValue("strat-domain");
  const modelType = getRadioValue("strat-model-type");

  if (domain === "AL-SIGHT+Hood") {
    return modelType === "Unimodal" ? app.data.unimodalStratified : app.data.multimodalStratified;
  }

  return app.data.domainSpecificStratified.filter(
    (row) => row.Domain === domain && row.Model_Type === modelType
  );
}

function getDelongRows() {
  const domain = getValue("delong-domain");
  const modelType = getRadioValue("delong-model-type");
  const outcome = getValue("delong-outcome");
  const significantOnly = document.getElementById("delong-significant-only").checked;

  const source =
    domain === "AL-SIGHT+Hood"
      ? app.data.delongAll
      : app.data.domainSpecificDelong.filter((row) => row.Domain === domain);

  let rows = source.filter((row) => row.Outcome === outcome && row.Model_Type === modelType);
  if (significantOnly) {
    rows = rows.filter((row) => row.Significant === "Yes");
  }
  return rows;
}

function getConfusionSourceForDomain(domain) {
  return domain === "AL-SIGHT+Hood"
    ? app.data.confusionAll
    : app.data.domainSpecificConfusion.filter((row) => row.Domain === domain);
}

function getConfusionRows() {
  return getConfusionSourceForDomain(getValue("cm-domain")).filter(
    (row) =>
      row.Outcome === getValue("cm-outcome") &&
      row.Model_Type === getRadioValue("cm-model-type") &&
      row.Threshold_Type === getValue("cm-threshold")
  );
}

function getThresholdRocRows() {
  const domain = getValue("te-domain");
  const outcome = getValue("te-outcome");
  const model = getValue("te-model");
  return getRocSourceForDomain(domain)
    .filter((row) => row.Outcome === outcome && row.Model === model)
    .filter((row) => isFiniteNumber(row.Threshold))
    .slice()
    .sort((a, b) => asNumber(a.Threshold) - asNumber(b.Threshold));
}

function getThresholdCounts() {
  const source = getConfusionSourceForDomain(getValue("te-domain"));
  const match = source.find(
    (row) => row.Outcome === getValue("te-outcome") && row.Model === getValue("te-model")
  );

  if (!match) {
    return { cases: 0, controls: 0 };
  }

  return {
    cases: (asNumber(match.TP) || 0) + (asNumber(match.FN) || 0),
    controls: (asNumber(match.TN) || 0) + (asNumber(match.FP) || 0),
  };
}

function computeThresholdMetrics(rocRows) {
  const threshold = asNumber(document.getElementById("te-threshold").value);
  const counts = getThresholdCounts();

  const nearest = rocRows
    .map((row) => ({ ...row, thresholdDiff: Math.abs(asNumber(row.Threshold) - threshold) }))
    .sort((a, b) => a.thresholdDiff - b.thresholdDiff)[0];

  const sensitivity = asNumber(nearest.Sensitivity);
  const specificity = asNumber(nearest.Specificity);
  const TP = Math.round((sensitivity || 0) * counts.cases);
  const FN = counts.cases - TP;
  const TN = Math.round((specificity || 0) * counts.controls);
  const FP = counts.controls - TN;
  const PPV = TP + FP > 0 ? TP / (TP + FP) : 0;
  const NPV = TN + FN > 0 ? TN / (TN + FN) : 0;
  const Accuracy = counts.cases + counts.controls > 0 ? (TP + TN) / (counts.cases + counts.controls) : 0;

  return {
    Threshold: asNumber(nearest.Threshold),
    TP,
    TN,
    FP,
    FN,
    Sensitivity: sensitivity,
    Specificity: specificity,
    PPV,
    NPV,
    Accuracy,
  };
}

function refreshRocModelOptions() {
  const domain = getValue("roc-domain");
  const outcome = getValue("roc-outcome");
  const modelType = getRadioValue("roc-model-type");
  const currentSelection = new Set(getCheckedValues("roc-models"));

  let rows = getRocSourceForDomain(domain).filter((row) => row.Outcome === outcome);
  if (modelType === "Unimodal") {
    rows = rows.filter((row) => row.Model_Type === "Unimodal");
  } else if (modelType === "Multimodal") {
    rows = rows.filter((row) => row.Model_Type === "Multimodal");
  }

  const options = uniqueValues(rows, "Model");
  const selected = options.filter((model) => currentSelection.has(model));
  const fallback = selected.length ? selected : options.slice(0, 3);
  renderCheckboxList("roc-models", options, fallback);
}

function refreshThresholdModelOptions(resetToYouden = false) {
  const domain = getValue("te-domain");
  const outcome = getValue("te-outcome");
  const currentModel = getValue("te-model");
  const options = uniqueValues(
    getRocSourceForDomain(domain).filter((row) => row.Outcome === outcome),
    "Model"
  );

  const selected = options.includes(currentModel) ? currentModel : options[0];
  setSelectOptions("te-model", options, selected);

  if (resetToYouden) {
    applyThresholdPreset("Youden");
  } else {
    updateThresholdDisplay();
  }
}

function applyThresholdPreset(thresholdType) {
  const source = getConfusionSourceForDomain(getValue("te-domain"));
  const row = source.find(
    (item) =>
      item.Outcome === getValue("te-outcome") &&
      item.Model === getValue("te-model") &&
      item.Threshold_Type === thresholdType
  );

  if (!row) {
    return;
  }

  document.getElementById("te-threshold").value = clamp01(asNumber(row.Threshold));
  updateThresholdDisplay();
  renderThresholdExplorer();
}

function updateThresholdDisplay() {
  const value = asNumber(document.getElementById("te-threshold").value);
  setText("te-threshold-display", formatFixed(value, 4));
}

function setupNavigation() {
  document.querySelectorAll(".tab-link").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      document.querySelectorAll(".tab-link").forEach((item) => item.classList.toggle("is-active", item === button));
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.tabPanel === tab);
      });
      document.body.classList.remove("sidebar-open");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
  });
}

function bindGenericPlotDownloads() {
  document.querySelectorAll("[data-plot-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const plotId = button.dataset.plotId;
      const filename = button.dataset.plotFilename || plotId;
      const plotNode = document.getElementById(plotId);
      if (!plotNode || !plotNode.data) {
        return;
      }
      Plotly.downloadImage(plotNode, {
        format: "png",
        filename,
        width: 1400,
        height: 900,
      });
    });
  });
}

function setPlotDownloadName(buttonId, filename) {
  const button = document.getElementById(buttonId);
  if (button) {
    button.dataset.plotFilename = sanitizeFilePart(filename);
  }
}

function bindCsvDownload(buttonId, rowsFn, filenameFn) {
  const button = document.getElementById(buttonId);
  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    const rows = rowsFn();
    downloadCsv(rows, filenameFn());
  });
}

function downloadCsv(rows, filename) {
  if (!rows || !rows.length) {
    return;
  }

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function renderTable(targetId, rows, options = {}) {
  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }

  const existing = app.tables.get(targetId);
  if (existing) {
    existing.destroy();
    app.tables.delete(targetId);
  }
  target.innerHTML = "";

  if (!rows || !rows.length) {
    target.innerHTML = '<div class="table-empty">No data available for the current selection.</div>';
    return;
  }

  const prepared = prepareTable(rows);
  const table = new Tabulator(target, {
    data: prepared.data,
    columns: prepared.columns,
    layout: options.layout || "fitDataStretch",
    pagination: options.pagination === false ? false : "local",
    paginationSize: options.paginationSize || Math.min(10, Math.max(5, rows.length)),
    placeholder: "No data available",
    responsiveLayout: options.responsiveLayout ?? false,
    movableColumns: false,
    height: options.height || false,
    tooltips: false,
  });

  app.tables.set(targetId, table);
}

function prepareTable(rows) {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const keyMap = Object.fromEntries(keys.map((key, index) => [key, `c${index}`]));

  const data = rows.map((row, rowIndex) => {
    const mapped = { __rowId: rowIndex };
    keys.forEach((key) => {
      mapped[keyMap[key]] = row[key] === undefined || row[key] === null ? "" : row[key];
    });
    return mapped;
  });

  const columns = keys.map((key) => ({
    title: key || " ",
    field: keyMap[key],
    headerSort: true,
    formatter: "plaintext",
  }));

  return { data, columns };
}

function renderPlot(targetId, traces, layout = {}) {
  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }

  Plotly.react(target, traces, layout, {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
  });
}

function renderEmptyPlot(targetId, message) {
  renderPlot(targetId, [], {
    ...basePlotLayout(),
    annotations: [
      {
        text: message,
        x: 0.5,
        y: 0.5,
        xref: "paper",
        yref: "paper",
        showarrow: false,
        font: { size: 15, color: "#5a6a82" },
      },
    ],
    xaxis: { visible: false },
    yaxis: { visible: false },
  });
}

function basePlotLayout() {
  return {
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    font: { family: "Manrope, sans-serif", color: "#182233" },
    margin: { l: 70, r: 20, t: 55, b: 60 },
    hoverlabel: { bgcolor: "#182233", font: { family: "Manrope, sans-serif" } },
  };
}

function baseRocLayout(domainLabel, outcomeLabel) {
  return {
    ...basePlotLayout(),
    title: {
      text: `${escapeHtml(domainLabel)} - ${escapeHtml(outcomeLabel)}`,
      x: 0.01,
      xanchor: "left",
    },
    xaxis: {
      title: { text: "1 - Specificity (False Positive Rate)" },
      range: [0, 1],
      zeroline: false,
    },
    yaxis: {
      title: { text: "Sensitivity (True Positive Rate)" },
      range: [0, 1],
      zeroline: false,
      scaleanchor: "x",
      scaleratio: 1,
    },
    legend: { orientation: "v", x: 1.02, y: 1 },
    margin: { l: 70, r: 170, t: 55, b: 65 },
  };
}

function referenceLine() {
  return {
    type: "scatter",
    mode: "lines",
    name: "Chance",
    x: [0, 1],
    y: [0, 1],
    line: { color: "rgba(24,34,51,0.35)", dash: "dash", width: 1.5 },
    hoverinfo: "skip",
  };
}

function renderStatStack(targetId, items) {
  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }

  target.innerHTML = items
    .map(
      (item) => `
        <div class="stat-item">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          ${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}
        </div>
      `
    )
    .join("");
}

function renderCheckboxList(targetId, options, selectedValues) {
  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }

  const selected = new Set(selectedValues);
  target.innerHTML = options
    .map(
      (option, index) => `
        <label class="checkbox-item" for="${targetId}-${index}">
          <input
            id="${targetId}-${index}"
            type="checkbox"
            value="${escapeAttribute(option)}"
            ${selected.has(option) ? "checked" : ""}
          >
          <span>${escapeHtml(option)}</span>
        </label>
      `
    )
    .join("");
}

function setSelectOptions(selectId, options, selectedValue) {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }

  const current = selectedValue ?? select.value;
  select.innerHTML = options
    .map((option) => `<option value="${escapeAttribute(option)}">${escapeHtml(option)}</option>`)
    .join("");

  if (options.includes(current)) {
    select.value = current;
  } else if (options.length) {
    select.value = options[0];
  }
}

function bindSelect(id, handler) {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener("change", handler);
  }
}

function bindRadioGroup(name, handler) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.addEventListener("change", handler);
  });
}

function getRadioValue(name) {
  const selected = document.querySelector(`input[name="${name}"]:checked`);
  return selected ? selected.value : "";
}

function getValue(id) {
  const element = document.getElementById(id);
  return element ? element.value : "";
}

function getCheckedValues(targetId) {
  return Array.from(document.querySelectorAll(`#${targetId} input[type="checkbox"]:checked`)).map(
    (input) => input.value
  );
}

function setAllCheckboxes(targetId, checked) {
  document.querySelectorAll(`#${targetId} input[type="checkbox"]`).forEach((input) => {
    input.checked = checked;
  });
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value ?? "";
  }
}

function showError(error) {
  console.error(error);
  const banner = document.getElementById("error-banner");
  banner.textContent = `Unable to initialize the GitHub Pages app: ${error.message}`;
  banner.classList.remove("is-hidden");
  document.getElementById("loading-state").classList.add("is-hidden");
}

function maxBy(rows, key) {
  return rows.reduce((best, current) => {
    if (!best) return current;
    return asNumber(current[key]) > asNumber(best[key]) ? current : best;
  }, null);
}

function extractScalar(rows, predicate, key) {
  const match = rows.find(predicate);
  return match ? asNumber(match[key]) : 0;
}

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter((value) => value !== undefined && value !== null && value !== "")));
}

function getCiLower(row) {
  return asNumber(row.AUC_Lower ?? row.AUC_CI_Lower);
}

function getCiUpper(row) {
  return asNumber(row.AUC_Upper ?? row.AUC_CI_Upper);
}

function formatAucCi(row, aucKey = "AUC", lowerKey = "AUC_Lower", upperKey = "AUC_Upper") {
  const auc = asNumber(row[aucKey]);
  const lower = lowerKey ? asNumber(row[lowerKey]) : getCiLower(row);
  const upper = upperKey ? asNumber(row[upperKey]) : getCiUpper(row);
  return `${formatFixed(auc, 3)} (${formatFixed(lower, 3)}, ${formatFixed(upper, 3)})`;
}

function formatFixed(value, digits = 3) {
  const number = asNumber(value);
  return isFiniteNumber(number) ? number.toFixed(digits) : "-";
}

function formatPct(value, digits = 1) {
  const number = asNumber(value);
  return isFiniteNumber(number) ? `${(number * 100).toFixed(digits)}%` : "-";
}

function formatInteger(value) {
  const number = asNumber(value);
  return isFiniteNumber(number) ? Math.round(number).toLocaleString("en-US") : "-";
}

function asNumber(value) {
  if (typeof value === "number") {
    return value;
  }
  if (value === null || value === undefined || value === "") {
    return NaN;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function isFiniteNumber(value) {
  return Number.isFinite(asNumber(value));
}

function paletteColor(index) {
  return ["#2f89bf", "#d65a5a", "#1f9f73", "#7562d8", "#e08a2f", "#1bb4d1"][index % 6];
}

function filenameFromParts(...parts) {
  return `${parts.map((part) => sanitizeFilePart(part)).filter(Boolean).join("_")}.csv`;
}

function sanitizeFilePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clamp01(value) {
  const number = asNumber(value);
  if (!isFiniteNumber(number)) {
    return 0;
  }
  return Math.min(1, Math.max(0, number));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
