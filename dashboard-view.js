const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const { getState } = require("@saltcorn/data/db/state");
const {
  div,
  script,
  domReady,
  h6,
  button,
  select,
  option,
  span,
  label,
  textarea,
} = require("@saltcorn/markup/tags");

const pivotAggregatorName = (statistic) => {
  switch (statistic) {
    case "Sum":
      return "Sum";
    case "Avg":
      return "Average";
    case "Max":
      return "Maximum";
    case "Min":
      return "Minimum";
    default:
      return "Count";
  }
};

const renderChartElement = async (element, state, req, configuration) => {
  const tbl = Table.findOne({ name: element.table });
  if (!tbl) throw new Error(`Table not found: ${element.table}`);
  const html = await new View({
    viewtemplate: "Chart",
    table_id: tbl.id,
    name: `llm_dash_${element.name}`,
    min_role: 100,
    configuration: { title: element.title, ...configuration },
  }).run(state, { req });
  return div({ class: "mb-3" }, html);
};

const renderPieElement = (element, state, req) =>
  renderChartElement(element, state, req, {
    plot_type: "pie",
    factor_field: element.factor_field,
    outcome_field: element.outcome_field || "Row count",
    statistic: element.statistic || "Count",
    pie_donut: !!element.pie_donut,
  });

const renderLineElement = (element, state, req) =>
  renderChartElement(element, state, req, {
    plot_type: "line",
    plot_series: "single",
    x_field: element.x_field,
    y_field: element.y_field,
    smooth: !!element.smooth,
  });

const renderBarElement = (element, state, req) =>
  renderChartElement(element, state, req, {
    plot_type: "bar",
    factor_field: element.factor_field,
    outcomes: [{ outcome_field: element.outcome_field || "Row count" }],
    statistic: element.statistic || "Count",
    bar_orientation: element.bar_orientation || "vertical",
  });

const renderScatterElement = (element, state, req) =>
  renderChartElement(element, state, req, {
    plot_type: "scatter",
    plot_series: "single",
    x_field: element.x_field,
    y_field: element.y_field,
  });

const renderHistogramElement = (element, state, req) =>
  renderChartElement(element, state, req, {
    plot_type: "histogram",
    histogram_field: element.histogram_field,
  });

const renderAreaElement = (element, state, req) =>
  renderChartElement(element, state, req, {
    plot_type: "area",
    plot_series: "single",
    x_field: element.x_field,
    y_field: element.y_field,
    smooth: !!element.smooth,
  });

const renderFunnelElement = (element, state, req) =>
  renderChartElement(element, state, req, {
    plot_type: "funnel",
    factor_field: element.factor_field,
    outcome_field: element.outcome_field || "Row count",
    statistic: element.statistic || "Count",
  });

const renderGaugeElement = (element, state, req) =>
  renderChartElement(element, state, req, {
    plot_type: "gauge",
    outcome_field: element.outcome_field || "Row count",
    statistic: element.statistic || "Count",
    gauge_type: "single",
    gauge_style: element.gauge_style || "arcs",
    gauge_name: element.gauge_name,
    gauge_min: element.gauge_min,
    gauge_max: element.gauge_max,
  });

const renderHeatmapElement = (element, state, req) =>
  renderChartElement(element, state, req, {
    plot_type: "heatmap",
    heatmap_x_field: element.heatmap_x_field,
    heatmap_y_field: element.heatmap_y_field,
    heatmap_value_field: element.heatmap_value_field || "Row count",
  });

const renderPivotTable = async (element) => {
  const { table: tableName, row_field, columns } = element;
  const tbl = Table.findOne({ name: tableName });
  if (!tbl) throw new Error(`Table not found: ${tableName}`);

  const fieldNames = [
    row_field,
    ...columns.map((c) => c.field).filter((f) => f && f !== "Row count"),
  ];
  const allRows = await tbl.getRows({});
  const rowData = allRows.map((r) => {
    const obj = {};
    for (const name of fieldNames) obj[name] = r[name];
    return obj;
  });

  const firstCol = columns?.[0];
  const aggregatorName = pivotAggregatorName(firstCol?.statistic);
  const vals =
    firstCol?.statistic !== "Count" &&
    firstCol?.statistic != null &&
    firstCol?.field !== "Row count"
      ? [firstCol.field]
      : [];

  const pivotCfg = JSON.stringify({
    rows: [row_field],
    cols: [],
    aggregatorName,
    vals,
    showUI: true,
  });

  const rndid = Math.floor(Math.random() * 16777215).toString(16);
  const divId = `llm_pivot_${element.name}_${rndid}`;

  return div(
    { class: "mb-3" },
    element.title ? h6({ class: "fw-semibold mb-2" }, element.title) : "",
    div({ id: divId }),
    script(
      domReady(`
const renderers_${rndid} = window.Plotly
  ? $.extend($.pivotUtilities.renderers, $.pivotUtilities.plotly_renderers)
  : $.pivotUtilities.renderers;
$("#${divId}").pivotUI(${JSON.stringify(rowData)}, {
  ...${pivotCfg},
  renderers: renderers_${rndid},
});`),
    ),
  );
};

const renderElement = async (element, state, req) => {
  switch (element.type) {
    case "piechart":
      return await renderPieElement(element, state, req);
    case "linechart":
      return await renderLineElement(element, state, req);
    case "barchart":
      return await renderBarElement(element, state, req);
    case "scatterchart":
      return await renderScatterElement(element, state, req);
    case "histogram":
      return await renderHistogramElement(element, state, req);
    case "areachart":
      return await renderAreaElement(element, state, req);
    case "funnel":
      return await renderFunnelElement(element, state, req);
    case "gauge":
      return await renderGaugeElement(element, state, req);
    case "heatmap":
      return await renderHeatmapElement(element, state, req);
    case "pivot_table":
      return await renderPivotTable(element);
    default:
      return div(
        { class: "alert alert-warning" },
        `Unknown element type: ${element.type}`,
      );
  }
};

const renderLayout = (node, elementMap) => {
  if (typeof node === "string") {
    return (
      elementMap[node] ??
      div({ class: "alert alert-danger" }, `Element not found: ${node}`)
    );
  }
  if (Array.isArray(node.besides)) {
    const cols = node.besides.map((child) =>
      div({ class: "col" }, renderLayout(child, elementMap)),
    );
    return div({ class: "row g-3" }, cols.join(""));
  }
  if (Array.isArray(node.above)) {
    return div(
      node.above.map((child) => renderLayout(child, elementMap)).join(""),
    );
  }
  return div({ class: "alert alert-warning" }, "Unrecognised layout node");
};

const buildSchemaContext = async (allowedTables) => {
  const tables = await Table.find({});
  const filtered = allowedTables?.length
    ? tables.filter((t) => allowedTables.includes(t.name))
    : tables;
  const parts = [];
  for (const tbl of filtered) {
    const fields = await tbl.getFields();
    const fieldList = fields
      .map((f) => `  ${f.name} (${f.type?.name || f.type})`)
      .join("\n");
    parts.push(`Table: ${tbl.name}\nFields:\n${fieldList}`);
  }
  return parts.join("\n\n");
};

const elementsTool = {
  type: "function",
  function: {
    name: "create_dashboard_elements",
    description:
      "Create the array of dashboard elements. Supported types: piechart, linechart, areachart, barchart, scatterchart, histogram, funnel, gauge, heatmap, pivot_table.",
    parameters: {
      type: "object",
      properties: {
        elements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Unique snake_case identifier for this element",
              },
              type: {
                type: "string",
                enum: [
                  "piechart",
                  "linechart",
                  "areachart",
                  "barchart",
                  "scatterchart",
                  "histogram",
                  "funnel",
                  "gauge",
                  "heatmap",
                  "pivot_table",
                ],
              },
              table: {
                type: "string",
                description: "Exact table name from the schema",
              },
              title: {
                type: "string",
                description: "Optional display title shown above the element",
              },
              factor_field: {
                type: "string",
                description:
                  "piechart/barchart/funnel – categorical field whose distinct values become slices, bars, or funnel stages",
              },
              outcome_field: {
                type: "string",
                description:
                  "piechart/barchart/funnel/gauge – numeric field to aggregate; use 'Row count' to count rows",
              },
              statistic: {
                type: "string",
                enum: ["Count", "Sum", "Avg", "Max", "Min"],
                description:
                  "piechart/barchart/funnel/gauge – aggregation applied to outcome_field",
              },
              pie_donut: {
                type: "boolean",
                description: "piechart only – render as a donut chart",
              },
              bar_orientation: {
                type: "string",
                enum: ["vertical", "horizontal"],
                description:
                  "barchart only – bar direction (default: vertical)",
              },
              x_field: {
                type: "string",
                description:
                  "linechart/areachart/scatterchart – field mapped to the X axis",
              },
              y_field: {
                type: "string",
                description:
                  "linechart/areachart/scatterchart – field mapped to the Y axis",
              },
              smooth: {
                type: "boolean",
                description: "linechart/areachart only – draw a smoothed curve",
              },
              histogram_field: {
                type: "string",
                description:
                  "histogram only – numeric field whose distribution is plotted",
              },
              gauge_name: {
                type: "string",
                description: "gauge only – label shown on the gauge needle/arc",
              },
              gauge_min: {
                type: "number",
                description: "gauge only – minimum value of the scale",
              },
              gauge_max: {
                type: "number",
                description: "gauge only – maximum value of the scale",
              },
              gauge_style: {
                type: "string",
                enum: ["arcs", "pointer"],
                description: "gauge only – visual style (default: arcs)",
              },
              heatmap_x_field: {
                type: "string",
                description:
                  "heatmap only – categorical field for the X axis of the grid",
              },
              heatmap_y_field: {
                type: "string",
                description:
                  "heatmap only – categorical field for the Y axis of the grid",
              },
              heatmap_value_field: {
                type: "string",
                description:
                  "heatmap only – numeric field whose value drives cell colour; use 'Row count' to count rows",
              },
              row_field: {
                type: "string",
                description: "pivot_table only – field to group rows by",
              },
              columns: {
                type: "array",
                description: "pivot_table only – aggregated columns to show",
                items: {
                  type: "object",
                  properties: {
                    field: {
                      type: "string",
                      description:
                        "Field to aggregate; use 'id' for a row count",
                    },
                    statistic: {
                      type: "string",
                      enum: ["Count", "Sum", "Avg", "Max", "Min"],
                    },
                  },
                  required: ["field", "statistic"],
                },
              },
            },
            required: ["name", "type", "table"],
          },
        },
      },
      required: ["elements"],
    },
  },
};

const layoutTool = {
  type: "function",
  function: {
    name: "create_dashboard_layout",
    description:
      "Arrange dashboard elements in a nested layout. Each node is either a string (element name), {besides: [...nodes]} for side-by-side columns, or {above: [...nodes]} for vertical stacking. Nodes nest freely, e.g. {above: [{besides: ['chart1', 'chart2']}, 'table1']}.",
    parameters: {
      type: "object",
      properties: {
        layout: {
          description:
            "Root layout node. Either a string element name, {besides: [...nodes]} for side-by-side, or {above: [...nodes]} for stacked. Each node in the arrays can itself be a string or another {besides}/{above} object, allowing arbitrary nesting.",
          type: "object",
          properties: {
            besides: {
              type: "array",
              description:
                "Nodes to show side by side. Each item is a string element name or a nested {besides}/{above} node.",
              items: {},
            },
            above: {
              type: "array",
              description:
                "Nodes to stack vertically. Each item is a string element name or a nested {besides}/{above} node.",
              items: {},
            },
          },
        },
      },
      required: ["layout"],
    },
  },
};

const extractToolResult = (result, key) => {
  const call = result?.tool_calls?.[0];
  if (!call) return null;
  const obj = call.input ?? JSON.parse(call.function?.arguments ?? "{}");
  return obj[key];
};

const CHART_TYPE_GUIDANCE = [
  "Chart type guidance:",
  '- piechart: factor_field = categorical field (the slices), outcome_field = numeric to aggregate (or "Row count"), statistic = aggregation.',
  '- barchart: factor_field = categorical axis, outcome_field = numeric to aggregate (or "Row count"), statistic = aggregation.',
  '- linechart: x_field = horizontal axis field (can be a Date or numeric field), y_field = a numeric field that already exists on each row. IMPORTANT: line charts plot raw row values — they do NOT aggregate. Do not use them for "count over time" or any aggregated metric; use barchart for those.',
  "- areachart: same as linechart — raw row values only, no aggregation. Use for continuous numeric data where you want the area under the line filled.",
  "- scatterchart: x_field + y_field = two numeric fields to compare as a scatter plot.",
  "- histogram: histogram_field = a single numeric field whose distribution to plot.",
  '- funnel: factor_field = stage/category field, outcome_field = numeric to aggregate (or "Row count"), statistic = aggregation. Best for pipeline or conversion data ordered from largest to smallest.',
  '- gauge: outcome_field = numeric to aggregate (or "Row count"), statistic = aggregation. Shows a single KPI value on a dial. Optionally set gauge_min, gauge_max, gauge_name, gauge_style ("arcs" or "pointer").',
  '- heatmap: heatmap_x_field + heatmap_y_field = two categorical fields that form the grid axes, heatmap_value_field = numeric cell value (or "Row count").',
  "- pivot_table: row_field = field to group rows by, columns = list of {field, statistic} aggregations.",
  'Use statistic "Count" and outcome_field "Row count" when counting rows.',
].join("\n");

const generateDashboard = async (prompt, allowedTables) => {
  const llmFn = getState().functions?.llm_generate;
  if (!llmFn)
    throw new Error(
      "llm_generate function not available – configure the large-language-model plugin first.",
    );

  const schemaContext = await buildSchemaContext(allowedTables);

  const elementsResult = await llmFn.run(
    [
      "You are a dashboard generator for a database application.",
      "",
      "Available database schema:",
      schemaContext,
      "",
      "User request: " + prompt,
      "",
      "Generate the dashboard elements as a tool call. Use only table and field names that exist in the schema above.",
      "",
      CHART_TYPE_GUIDANCE,
    ].join("\n"),
    {
      tools: [elementsTool],
      tool_choice: {
        type: "function",
        function: { name: "create_dashboard_elements" },
      },
    },
  );

  const elements = extractToolResult(elementsResult, "elements");
  if (!elements?.length)
    throw new Error(
      "LLM did not return dashboard elements. Check your prompt or LLM configuration.",
    );

  const elementNames = elements.map((e) => e.name);
  const layoutResult = await llmFn.run(
    [
      "Arrange these dashboard elements in a nested layout using besides (side-by-side) and above (stacked) nodes.",
      "",
      "Element names: " + elementNames.join(", "),
      "",
      "Rules:",
      "- A node is either a string (element name), {besides: [...nodes]}, or {above: [...nodes]}.",
      '- Nodes nest freely. For example, to put two charts side by side above a table: {above: [{besides: ["chart1", "chart2"]}, "table1"]}.',
      "- Use besides for charts that belong together visually; use above to separate different sections.",
      "",
      "Original user request: " + prompt,
      "",
      "Call create_dashboard_layout with an appropriate arrangement.",
    ].join("\n"),
    {
      tools: [layoutTool],
      tool_choice: {
        type: "function",
        function: { name: "create_dashboard_layout" },
      },
    },
  );

  const layout =
    extractToolResult(layoutResult, "layout") ??
    (elementNames.length > 1 ? { besides: elementNames } : elementNames[0]);

  return { elements, layout };
};

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "Dashboard prompt",
        form: async () =>
          new Form({
            fields: [
              {
                name: "prompt",
                label: "Dashboard description",
                sublabel:
                  "Describe the dashboard you want. The LLM will generate it when you save.",
                type: "String",
                fieldview: "textarea",
                required: true,
              },
              {
                name: "allow_user_dashboards",
                label: "Allow users to create their own dashboards",
                sublabel:
                  "Logged-in users can generate and save personal dashboards from this view.",
                type: "Bool",
              },
            ],
          }),
      },
      {
        name: "User dashboard settings",
        onlyWhen: (context) => context.allow_user_dashboards,
        form: async () => {
          const tables = await Table.find({});
          return new Form({
            fields: tables.map((t) => ({
              name: "table_allowed_" + t.name,
              label: t.name,
              type: "Bool",
              default: true,
            })),
          });
        },
      },
    ],
    onDone: async (context) => {
      const { prompt, allow_user_dashboards } = context;
      const { elements, layout } = await generateDashboard(prompt);

      let allowed_tables = [];
      if (allow_user_dashboards) {
        const tables = await Table.find({});
        allowed_tables = tables
          .filter((t) => context["table_allowed_" + t.name])
          .map((t) => t.name);
      }

      return {
        ...context,
        elements,
        layout,
        allowed_tables,
        allow_user_dashboards,
      };
    },
  });

const renderUserBar = (viewname, activeDash, userDashes, activePrompt) => {
  const isUserDash = activeDash !== "admin";

  // Toolbar
  const dashSelect = select(
    {
      class: "form-select form-select-sm w-auto",
      onchange: "llmDashSwitch(this.value)",
    },
    option(
      { value: "admin", ...(activeDash === "admin" && { selected: true }) },
      "Default (Admin)",
    ),
    ...userDashes.map((d, i) =>
      option(
        { value: i, ...(activeDash === i && { selected: true }) },
        d.label || `Dashboard ${i + 1}`,
      ),
    ),
  );

  const toolbar = div(
    {
      class:
        "llm-dash-user-bar border-top bg-light p-2 d-flex align-items-center gap-2 flex-wrap",
    },
    span({ class: "fw-semibold text-muted small me-1" }, "Dashboard:"),
    dashSelect,
    button(
      { class: "btn btn-sm btn-outline-primary", onclick: "llmDashNew()" },
      "+ New",
    ),
    isUserDash
      ? button(
          {
            class: "btn btn-sm btn-outline-secondary",
            onclick: `llmDashEdit(${activeDash}, ${JSON.stringify(activePrompt || "")})`,
          },
          "Edit",
        )
      : "",
    isUserDash
      ? button(
          {
            class: "btn btn-sm btn-outline-danger",
            onclick: `llmDashDelete(${activeDash})`,
          },
          "Delete",
        )
      : "",
  );

  // Modal
  const modal = `
<div class="modal fade" id="llmDashModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="llmDashModalLabel">New Dashboard</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        ${label({ for: "llmDashPromptInput", class: "form-label" }, "Describe your dashboard")}
        ${textarea(
          {
            id: "llmDashPromptInput",
            class: "form-control",
            rows: "4",
            placeholder: "e.g. Show me sales by category and orders over time",
          },
          "",
        )}
        ${div({ id: "llmDashModalError", class: "text-danger mt-2 d-none" }, "")}
      </div>
      <div class="modal-footer">
        ${button({ type: "button", class: "btn btn-secondary", "data-bs-dismiss": "modal" }, "Cancel")}
        ${button(
          {
            type: "button",
            id: "llmDashGenerateBtn",
            class: "btn btn-primary",
            onclick: "llmDashSubmit()",
          },
          span(
            {
              id: "llmDashSpinner",
              class: "spinner-border spinner-border-sm d-none me-1",
              role: "status",
            },
            "",
          ),
          "Generate",
        )}
      </div>
    </div>
  </div>
</div>`;

  const js = script(`
var _llmDashEditIndex = null;
var _llmDashViewname = ${JSON.stringify(viewname)};

function llmDashSwitch(val) {
  var url = new URL(window.location.href);
  url.searchParams.set('active_user_dash', val);
  window.location.href = url.toString();
}

function llmDashNew() {
  _llmDashEditIndex = null;
  document.getElementById('llmDashModalLabel').textContent = 'New Dashboard';
  document.getElementById('llmDashPromptInput').value = '';
  document.getElementById('llmDashModalError').classList.add('d-none');
  new bootstrap.Modal(document.getElementById('llmDashModal')).show();
}

function llmDashEdit(idx, prompt) {
  _llmDashEditIndex = idx;
  document.getElementById('llmDashModalLabel').textContent = 'Edit Dashboard';
  document.getElementById('llmDashPromptInput').value = prompt || '';
  document.getElementById('llmDashModalError').classList.add('d-none');
  new bootstrap.Modal(document.getElementById('llmDashModal')).show();
}

function llmDashSubmit() {
  var prompt = document.getElementById('llmDashPromptInput').value.trim();
  if (!prompt) return;
  var spinner = document.getElementById('llmDashSpinner');
  var btn = document.getElementById('llmDashGenerateBtn');
  spinner.classList.remove('d-none');
  btn.disabled = true;
  var body = { prompt: prompt };
  if (_llmDashEditIndex !== null) body.index = _llmDashEditIndex;
  view_post(_llmDashViewname, 'save_user_dashboard', body, function(res) {
    spinner.classList.add('d-none');
    btn.disabled = false;
    if (res.error) {
      var errEl = document.getElementById('llmDashModalError');
      errEl.textContent = res.error;
      errEl.classList.remove('d-none');
      return;
    }
    var url = new URL(window.location.href);
    url.searchParams.set('active_user_dash', res.index);
    window.location.href = url.toString();
  });
}

function llmDashDelete(idx) {
  if (!confirm('Delete this dashboard?')) return;
  view_post(_llmDashViewname, 'delete_user_dashboard', { index: idx }, function(res) {
    if (res.error) { alert(res.error); return; }
    var url = new URL(window.location.href);
    url.searchParams.set('active_user_dash', 'admin');
    window.location.href = url.toString();
  });
}
`);

  return toolbar + modal + js;
};

const renderDashboard = async (elements, layout, state, req) => {
  const elementMap = {};
  for (const element of elements) {
    try {
      elementMap[element.name] = await renderElement(element, state, req);
    } catch (e) {
      elementMap[element.name] = div(
        { class: "alert alert-danger" },
        `Error rendering "${element.name}": ${e.message}`,
      );
    }
  }
  return renderLayout(layout, elementMap);
};

const get_state_fields = (table_id, viewname, cfg) => {
  if (cfg?.allow_user_dashboards) {
    return [{ name: "active_user_dash", type: "String", show_in_menu: false }];
  }
  return [];
};

const run = async (table_id, viewname, cfg, state, { req }) => {
  const { elements, layout, allow_user_dashboards, user_dashboards } =
    cfg || {};

  const userId = req?.user?.id;
  const showUserBar = !!(allow_user_dashboards && userId);
  const userDashes = (showUserBar && user_dashboards?.[userId]) || [];

  // Resolve which dashboard to render
  let activeElements = elements;
  let activeLayout = layout;
  let activeDash = "admin";
  let activePrompt = null;

  if (
    showUserBar &&
    state.active_user_dash != null &&
    state.active_user_dash !== "admin"
  ) {
    const idx = parseInt(state.active_user_dash, 10);
    const userDash = !isNaN(idx) && userDashes[idx];
    if (userDash) {
      activeElements = userDash.elements;
      activeLayout = userDash.layout;
      activeDash = idx;
      activePrompt = userDash.prompt || null;
    }
  }

  if (!activeElements || !activeLayout) {
    return div(
      { class: "alert alert-info" },
      "Dashboard not yet generated. Edit this view and save to generate it.",
    );
  }

  const content = await renderDashboard(
    activeElements,
    activeLayout,
    state,
    req,
  );
  const bar = showUserBar
    ? renderUserBar(viewname, activeDash, userDashes, activePrompt)
    : "";

  return div({ class: "container-fluid pb-4" }, content) + bar;
};

const save_user_dashboard = async (
  table_id,
  viewname,
  config,
  body,
  { req },
) => {
  const userId = req?.user?.id;
  if (!userId) return { json: { error: "Must be logged in" } };
  if (!config.allow_user_dashboards) return { json: { error: "Not allowed" } };

  const { prompt, index: editIndex } = body;
  if (!prompt) return { json: { error: "Prompt is required" } };

  let generated;
  try {
    generated = await generateDashboard(prompt, config.allowed_tables);
  } catch (e) {
    return { json: { error: e.message } };
  }

  const view = await View.findOne({ name: viewname });
  const existingByUser = { ...(view.configuration.user_dashboards || {}) };
  const userDashes = [...(existingByUser[userId] || [])];
  const dashEntry = { label: prompt.slice(0, 60), prompt, ...generated };

  let newIndex;
  const parsedEdit = editIndex != null ? parseInt(editIndex, 10) : NaN;
  if (!isNaN(parsedEdit) && parsedEdit >= 0 && parsedEdit < userDashes.length) {
    userDashes[parsedEdit] = dashEntry;
    newIndex = parsedEdit;
  } else {
    userDashes.push(dashEntry);
    newIndex = userDashes.length - 1;
  }

  existingByUser[userId] = userDashes;
  await View.update(
    {
      configuration: { ...view.configuration, user_dashboards: existingByUser },
    },
    view.id,
  );
  await getState().refresh_views();

  return { json: { success: true, index: newIndex } };
};

const delete_user_dashboard = async (
  table_id,
  viewname,
  config,
  body,
  { req },
) => {
  const userId = req?.user?.id;
  if (!userId) return { json: { error: "Must be logged in" } };
  if (!config.allow_user_dashboards) return { json: { error: "Not allowed" } };

  const idx = parseInt(body.index, 10);
  const view = await View.findOne({ name: viewname });
  const existingByUser = { ...(view.configuration.user_dashboards || {}) };
  const userDashes = [...(existingByUser[userId] || [])];

  if (isNaN(idx) || idx < 0 || idx >= userDashes.length)
    return { json: { error: "Invalid index" } };

  userDashes.splice(idx, 1);
  existingByUser[userId] = userDashes;
  await View.update(
    {
      configuration: { ...view.configuration, user_dashboards: existingByUser },
    },
    view.id,
  );
  await getState().refresh_views();

  return { json: { success: true } };
};

module.exports = {
  name: "LLM Dashboard",
  display_state_form: false,
  tableless: true,
  get_state_fields,
  configuration_workflow,
  run,
  routes: { save_user_dashboard, delete_user_dashboard },
};
