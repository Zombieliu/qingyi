const REQUIRED_MAJOR = 22;
const [majorRaw] = process.versions.node.split(".");
const currentMajor = Number(majorRaw);

if (!Number.isFinite(currentMajor) || currentMajor !== REQUIRED_MAJOR) {
  console.error(
    `[node-version] Expected Node ${REQUIRED_MAJOR}.x, received ${process.version}. Run \`nvm use ${REQUIRED_MAJOR}\`.`
  );
  process.exit(1);
}
