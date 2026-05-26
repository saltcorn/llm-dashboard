module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "llm-dashboard",
  dependencies: ["@saltcorn/large-language-model"],
  headers: [
    // {
    //   script: `/plugins/public/llm-dashboard@${
    //     require("./package.json").version
    //   }/echarts.min.js`,
    //   onlyViews: ["LLM Dashboard"],
    // },
    // {
    //   script: `/plugins/public/llm-dashboard@${
    //     require("./package.json").version
    //   }/ecStat.min.js`,
    //   onlyViews: ["LLM Dashboard"],
    // },
    {
      css: `/plugins/public/llm-dashboard@${
        require("./package.json").version
      }/jquery-ui.min.css`,
      onlyViews: ["LLM Dashboard"],
    },
    {
      script: `/plugins/public/llm-dashboard@${
        require("./package.json").version
      }/jquery-ui.min.js`,
      onlyViews: ["LLM Dashboard"],
    },
    {
      css: `/plugins/public/llm-dashboard@${
        require("./package.json").version
      }/jquery-ui.min.css`,
      onlyViews: ["LLM Dashboard"],
    },
    {
      script: `/plugins/public/llm-dashboard@${
        require("./package.json").version
      }/pivot.min.js`,
      onlyViews: ["LLM Dashboard"],
    },
    {
      script: `/plugins/public/llm-dashboard@${
        require("./package.json").version
      }/moment.min.js`,
      onlyViews: ["LLM Dashboard"],
    },
    {
      script: `/plugins/public/llm-dashboard@${
        require("./package.json").version
      }/plotly_renderers.min.js`,
      defer: true,
      onlyViews: ["LLM Dashboard"],
    },
    {
      css: `/plugins/public/llm-dashboard@${
        require("./package.json").version
      }/pivot.min.css`,
      onlyViews: ["LLM Dashboard"],
    },
  ],
  viewtemplates: [require("./dashboard-view.js")],
};
