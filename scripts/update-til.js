const fs = require("fs");
const https = require("https");

const TIL_REPO = "allwayso/TIL";
const README_PATH = "README.md";
const MAX_ENTRIES = 3;

function githubApi(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.github.com",
      path,
      headers: {
        "User-Agent": "allwayso-readme-bot",
        Authorization: `token ${process.env.GH_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    };
    https.get(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`${res.statusCode}: ${data}`));
        resolve(JSON.parse(data));
      });
    }).on("error", reject);
  });
}

async function getLatestTilEntries() {
  // Fetch pre-built index.json from TIL repo (single API call)
  const indexData = await githubApi(`/repos/${TIL_REPO}/contents/index.json`);
  const indexContent = Buffer.from(indexData.content, "base64").toString("utf-8");
  const allEntries = JSON.parse(indexContent);

  // index.json is already sorted by date descending; take top N
  const latest = allEntries.slice(0, MAX_ENTRIES);

  return latest.map((e) => ({
    title: e.title,
    path: e.path,
    slug: e.path.replace(/\.md$/, ""),
  }));
}

function updateReadme(entries) {
  let readme = fs.readFileSync(README_PATH, "utf-8");

  for (let i = 0; i < MAX_ENTRIES; i++) {
    const marker = `<!-- TIL:${i + 1} -->`;
    if (entries[i]) {
      const entry = entries[i];
      const replacement = `<!-- TIL:${i + 1} --> **[${entry.title}](https://github.com/allwayso/TIL/blob/main/${entry.path})**`;
      readme = readme.replace(marker, replacement);
    } else {
      readme = readme.replace(marker + " *TIL is empty yet*", marker + " *TIL is empty yet*");
      readme = readme.replace(marker, marker);
    }
  }

  fs.writeFileSync(README_PATH, readme);
}

(async () => {
  try {
    const entries = await getLatestTilEntries();
    console.log(`Found ${entries.length} TIL entries`);
    if (entries.length > 0) {
      updateReadme(entries);
      console.log("README updated");
    }
  } catch (e) {
    console.error("Failed to update TIL:", e.message);
    process.exit(1);
  }
})();
