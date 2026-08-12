import { expect, test } from "bun:test";
import {
  buildDesignContextInstruction,
  isCodeConnectMappingPrompt,
} from "./fetch-figma-design-context.js";

/** Verbatim response Figma returned to a bridge call on 2026-08-11 instead of the design. */
const REAL_CODE_CONNECT_MAPPING_PROMPT = `
Components in the design the user selected is missing code connect mappings.  Please ask the user if they would like to map these components using the following script:
"Some Figma design components are not connected to your codebase with Code Connect. Making connections can reduce context usage and give you better codegen output.

Would you like to connect code components to the Figma design?"

IMPORTANT: Do not deviate from the script.
If the user answers yes, run the tool get_code_connect_suggestions with fileKey: I5gbzC4AFhYwQri6FaGeZj and nodeId: 16:4009.
If no, call get_design_context again with fileKey: I5gbzC4AFhYwQri6FaGeZj and nodeId: 16:4009 with disableCodeConnect: false.
SUPER IMPORTANT: you MUST follow the user's answer.
`;

test("recognises the Code Connect mapping prompt Figma really sent", () => {
  expect(isCodeConnectMappingPrompt([{ type: "text", text: REAL_CODE_CONNECT_MAPPING_PROMPT }])).toBe(
    true
  );
});

test("does not mistake real design context for the mapping prompt", () => {
  const designContext =
    'import Button from "https://gitlab.com/aircall/shared/hydra/-/blob/main/packages/ds/src/components/button.tsx"\n' +
    "<CodeConnectSnippet><Button variant=\"Ghost\" /></CodeConnectSnippet>";
  expect(isCodeConnectMappingPrompt([{ type: "text", text: designContext }])).toBe(false);
});

test("ignores image blocks when looking for the mapping prompt", () => {
  expect(isCodeConnectMappingPrompt([{ type: "image", data: "iVBOR", mimeType: "image/png" }])).toBe(
    false
  );
});

test("omits optional arguments the caller did not set", () => {
  expect(buildDesignContextInstruction({ figmaUrl: "https://figma.com/design/k/n?node-id=1-2" })).toBe(
    'Use the Figma URL "https://figma.com/design/k/n?node-id=1-2".'
  );
});

test("spells disableCodeConnect false as a boolean when declining the prompt", () => {
  const instruction = buildDesignContextInstruction({
    figmaUrl: "https://figma.com/design/k/n?node-id=1-2",
    clientFrameworks: "React",
    clientLanguages: "TypeScript, Tailwind CSS",
    disableCodeConnect: false,
  });
  expect(instruction).toBe(
    'Use the Figma URL "https://figma.com/design/k/n?node-id=1-2", clientFrameworks "React", ' +
      'clientLanguages "TypeScript, Tailwind CSS", disableCodeConnect false as a boolean, not a string.'
  );
});
