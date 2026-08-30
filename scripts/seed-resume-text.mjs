import { readFileSync, writeFileSync } from 'node:fs';

const files = ['data/layout01.json', 'data/layout02.json'];
const copy = [
  [2, 'resumeScene2', 'ABOUT / LONDON', 'ABOUT / LONDON\nData, web, and AI\nwith a human point of view.\nSenior Data Engineer with 5+ years across banking, technology, and professional services.', '关于 / 伦敦\n数据、网站与 AI\n以人为本的技术视角。\n拥有 5 年以上银行、科技与专业服务领域经验。', 120, 610],
  [3, 'resumeScene3', 'EXPERIENCE / 2021—2026', 'EXPERIENCE / 2021—2026\nTurning operational friction\ninto reliable systems.\n300+ departmental requests automated; 30 years of A-share market data analysed.', '经历 / 2021—2026\n把运营摩擦\n变成可靠系统。\n自动化处理 300 多项部门需求；分析 30 年 A 股市场数据。', 120, 610],
  [4, 'resumeScene4', 'ENGINEERING / AUTOMATION', 'ENGINEERING / AUTOMATION\nFrom regulatory data\nto decisions people can trust.\n70+ regulatory reports automated; 50+ production-grade reports shipped.', '工程 / 自动化\n从监管数据\n到值得信赖的决策。\n自动化 70 多份监管报告；交付 50 多份生产级报告。', 120, 610],
  [5, 'resumeScene5', 'SELECTED WORK / SYSTEMS', 'SELECTED WORK / SYSTEMS\nBuild the pipeline.\nQuestion the default.\nPython · Spark · Oracle · MySQL · Java\nETL automation · quantitative research · dashboards', '精选工作 / 系统\n构建数据管道。\n重新思考默认方案。\nPython · Spark · Oracle · MySQL · Java\nETL 自动化 · 量化研究 · 数据看板', 120, 610],
  [6, 'resumeScene6', 'EDUCATION / 2014—2025', 'EDUCATION / 2014—2025\nCuriosity is part\nof the toolkit.\nMSc Big Data & High Performance Computing, University of Liverpool.\nBEng Computer Science, Zhengzhou University.', '教育 / 2014—2025\n好奇心也是\n工具箱的一部分。\n利物浦大学：大数据与高性能计算硕士。\n郑州大学：计算机科学与技术学士。', 120, 610],
  [7, 'resumeScene7', 'NOW / AVAILABLE IMMEDIATELY', 'NOW / AVAILABLE IMMEDIATELY\nOpen to full-time\ndata engineering work.\nLondon, UK · Full legal right to work in the UK\njoe.jiaqiao.wan@gmail.com', '现在 / 可立即开始\n正在寻找全职\n数据工程岗位。\n英国伦敦 · 拥有英国合法工作权\njoe.jiaqiao.wan@gmail.com', 120, 610]
];

for (const file of files) {
  const layout = JSON.parse(readFileSync(file, 'utf8'));
  for (const [scene, id, name, en, zh, x, y] of copy) {
    layout.layers[id] = {
      type: 'text', scene, role: 'resume-copy', core: false, name, x, y,
      scale: 1, rotation: 0, opacity: 1, z: 8, visible: true, locked: false,
      flow: false, localized: true, texts: { en, zh }, text: en,
      textStyle: { fontSize: 34, fontWeight: 650, letterSpacing: -0.6, lineHeight: 1.12, color: '#ffffff', align: 'left', fontFamily: 'inherit' },
      boxWidth: 720
    };
  }
  writeFileSync(file, JSON.stringify(layout));
}
