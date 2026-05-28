const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const { getState } = require("@saltcorn/data/db/state");
const { div, script, domReady, h6 } = require("@saltcorn/markup/tags");

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

const renderPieElement = async (element, state, req) => {
  const tbl = Table.findOne({ name: element.table });
  if (!tbl) throw new Error(`Table not found: ${element.table}`);
  const html = await new View({
    viewtemplate: "Chart",
    table_id: tbl.id,
    name: `llm_dash_${element.name}`,
    min_role: 1,
    configuration: {
      plot_type: "pie",
      factor_field: element.factor_field,
      outcome_field: element.outcome_field || "Row count",
      statistic: element.statistic || "Count",
      pie_donut: !!element.pie_donut,
      title: element.title,
    },
  }).run(state, { req });
  return div({ class: "mb-3" }, html);
};

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
  if (element.type === "piechart") {
    return await renderPieElement(element, state, req);
  }
  if (element.type === "pivot_table") {
    return await renderPivotTable(element);
  }
  return div(
    { class: "alert alert-warning" },
    `Unknown element type: ${element.type}`,
  );
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

const buildSchemaContext = async () => {
  const tables = await Table.find({});
  const parts = [];
  for (const tbl of tables) {
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
      "Create the array of dashboard elements. Each element is either a piechart or a pivot_table.",
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
                enum: ["piechart", "pivot_table"],
              },
              table: {
                type: "string",
                description: "Exact table name from the schema",
              },
              title: {
                type: "string",
                description: "Optional display title shown above the element",
              },
              // piechart fields
              factor_field: {
                type: "string",
                description:
                  "piechart only – categorical field whose distinct values become pie slices",
              },
              outcome_field: {
                type: "string",
                description:
                  "piechart only – numeric field to aggregate; use 'Row count' for Count",
              },
              statistic: {
                type: "string",
                enum: ["Count", "Sum", "Avg", "Max", "Min"],
                description:
                  "piechart only – aggregation applied to outcome_field",
              },
              pie_donut: {
                type: "boolean",
                description:
                  "piechart only – render as a donut chart instead of pie",
              },
              // pivot_table fields
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
            ],
          }),
      },
    ],
    onDone: async (context) => {
      const { prompt } = context;
      const llmFn = getState().functions?.llm_generate;
      if (!llmFn) {
        throw new Error(
          "llm_generate function not available – configure the large-language-model plugin first.",
        );
      }

      const schemaContext = await buildSchemaContext();

      // Step 1, generate elements
      const elementsPrompt = `You are a dashboard generator for a database application.

Available database schema:
${schemaContext}

User request: ${prompt}

Generate the dashboard elements as a tool call. Use only table and field names that exist in the schema above.
For pie charts: factor_field is the categorical field (the wedges), outcome_field is the numeric field to aggregate.
Use statistic "Count" and outcome_field "Row count" when counting rows.`;

      const elementsResult = await llmFn.run(elementsPrompt, {
        tools: [elementsTool],
        tool_choice: {
          type: "function",
          function: { name: "create_dashboard_elements" },
        },
      });

      const elements = extractToolResult(elementsResult, "elements");
      // console.log({ elements });
      if (!elements?.length) {
        throw new Error(
          "LLM did not return dashboard elements. Check your prompt or LLM configuration.",
        );
      }

      // Step2, generate layout
      const elementNames = elements.map((e) => e.name);
      const layoutPrompt = `Arrange these dashboard elements in a nested layout using besides (side-by-side) and above (stacked) nodes.

Element names: ${elementNames.join(", ")}

Rules:
- A node is either a string (element name), {besides: [...nodes]}, or {above: [...nodes]}.
- Nodes nest freely. For example, to put two charts side by side above a table: {above: [{besides: ["chart1", "chart2"]}, "table1"]}.
- Use besides for charts that belong together visually; use above to separate different sections.

Original user request: ${prompt}

Call create_dashboard_layout with an appropriate arrangement.`;

      const layoutResult = await llmFn.run(layoutPrompt, {
        tools: [layoutTool],
        tool_choice: {
          type: "function",
          function: { name: "create_dashboard_layout" },
        },
      });

      const layout =
        extractToolResult(layoutResult, "layout") ??
        (elementNames.length > 1 ? { besides: elementNames } : elementNames[0]);

      return { ...context, elements, layout };
    },
  });

const run = async (table_id, viewname, cfg, state, { req }) => {
  const { elements, layout } = cfg || {};

  if (!elements || !layout) {
    return div(
      { class: "alert alert-info" },
      "Dashboard not yet generated. Edit this view and save to generate it.",
    );
  }

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

  return div({ class: "container-fluid" }, renderLayout(layout, elementMap));
};

module.exports = {
  name: "LLM Dashboard",
  display_state_form: false,
  tableless: true,
  get_state_fields: () => [],
  configuration_workflow,
  run,
};
