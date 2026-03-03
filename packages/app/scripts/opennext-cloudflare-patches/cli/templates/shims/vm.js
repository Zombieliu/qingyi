export function runInNewContext(code, context = {}) {
  const fn = new Function("context", `with (context) { ${code} }`);
  return fn(context);
}

export default {
  runInNewContext,
};
