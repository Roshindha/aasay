/** Hand-curated replacements, used by candidate generators. Not exhaustive. */
export const PACKAGE_REPLACEMENTS: Record<"npm" | "pypi", Record<string, string>> = {
  npm: { "express-validator-pro": "express-validator", "left-padder": "left-pad" },
  pypi: { fastjsonvalidate: "jsonschema" },
};

export const API_REPLACEMENTS: Record<string, string> = {
  "Promise.allResolved": "Promise.allSettled",
  "Promise.resolveAll": "Promise.all",
  "Object.deepClone": "structuredClone",
  "JSON.parseSafe": "JSON.parse",
  "JSON.tryParse": "JSON.parse",
  "json.parse": "json.loads",
  "json.stringify": "json.dumps",
  "os.getcwdu": "os.getcwd",
  "time.clock": "time.perf_counter",
  "os.makedir": "os.makedirs",
  "os.mkdirs": "os.makedirs",
};
