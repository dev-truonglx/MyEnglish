const fs = require('fs');

let content = fs.readFileSync('src/components/review/ReviewTopBar.tsx', 'utf8');

const contextMatchBtn = `
        <button
          onClick={() => handleModeChange("multiple_choice")}
          className={\`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all \${
            mode === "multiple_choice"
              ? "bg-white dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-blue-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }\`}
        >
          <span>🎯 Trắc nghiệm</span>
        </button>
`;

const meaningMatchBtn = `
        <button
          onClick={() => handleModeChange("meaning_match")}
          className={\`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all \${
            mode === "meaning_match"
              ? "bg-white dark:bg-pink-500/20 text-pink-700 dark:text-pink-300 border border-slate-200 dark:border-pink-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }\`}
        >
          <span>🔗 Nối từ</span>
        </button>
`;

content = content.replace(contextMatchBtn, contextMatchBtn + meaningMatchBtn);
fs.writeFileSync('src/components/review/ReviewTopBar.tsx', content);
