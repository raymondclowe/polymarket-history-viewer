// Temporary script: evaluate the template literal in html.js and write to file
import { writeFileSync } from "fs";
import { HTML_PAGE } from "./src/html.js";
writeFileSync("./public/index.html", HTML_PAGE, "utf-8");
console.log(`Written ${HTML_PAGE.length} chars to public/index.html`);
