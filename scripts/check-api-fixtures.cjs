const fs = require("fs");

const filePath = "docs/api-fixtures.md";
const text = fs.readFileSync(filePath, "utf8");
const blocks = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => match[1]);

for (const [index, block] of blocks.entries()) {
  try {
    JSON.parse(block);
  } catch (error) {
    console.error(`${filePath}: fixture ${index + 1} is invalid JSON`);
    console.error(error);
    process.exit(1);
  }
}

console.log(`Validated ${blocks.length} API fixture JSON blocks.`);
