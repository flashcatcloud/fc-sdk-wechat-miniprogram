const fs = require("fs");
const path = require("path");
const { compileFromFile } = require("json-schema-to-typescript");

const schemasDirectoryPath = path.join(
  __dirname,
  "../rum-events-format/schemas",
);

const BANNER_COMMENT = [
  "/* eslint-disable */",
  "/**",
  " * DO NOT MODIFY IT BY HAND. Run `yarn rum-events-format:sync` instead.",
  " */",
].join("\n");

async function generateTypesFromSchema(typesPath, schema, options = {}) {
  const schemaPath = path.join(schemasDirectoryPath, schema);
  console.log(`Compiling ${schemaPath}...`);
  const compiledTypes = await compileFromFile(schemaPath, {
    cwd: schemasDirectoryPath,
    bannerComment: BANNER_COMMENT,
    style: {
      semi: false,
      singleQuote: true,
      trailingComma: "es5",
      printWidth: 120,
    },
    ...options,
  });
  console.log(`Writing ${typesPath}...`);
  fs.writeFileSync(typesPath, compiledTypes);
  console.log("Generation done.");
}

async function main() {
  try {
    await generateTypesFromSchema(
      path.join(__dirname, "../packages/miniprogram-rum/src/rumEvent.types.ts"),
      "rum-events-schema.json",
    );
    console.log("\n✅ All schema types generated successfully.");
  } catch (err) {
    console.error("❌ Failed to generate schema types:", err);
    process.exit(1);
  }
}

main();
