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

function walkTree(sha, prefix = "") {
  return githubApi(`/repos/${TIL_REPO}/git/trees/${sha}?recursive=1`).then((tree) =>
    tree.tree
      .filter((f) => f.type === "blob" && f.path.endsWith(".md") && f.path !== "README.md")
      .map((f) => ({ path: f.path, sha: f.sha }))
  );
}

async function getLatestTilEntries() {
  // Step 1: get default branch
  const repo = await githubApi(`/repos/${TIL_REPO}`);
  const branch = repo.default_branch;

  // Step 2: get tree
  const branchData = await githubApi(`/repos/${TIL_REPO}/git/ref/heads/${branch}`);
  const rootSha = branchData.object.sha;
  const tree = await githubApi(`/repos/${TIL_REPO}/git/trees/${rootSha}?recursive=1`);

  const mdFiles = tree.tree
    .filter((f) => f.type === "blob" && f.path.endsWith(".md") && f.path !== "README.md")
    .map((f) => ({ path: f.path, sha: f.sha }));

  if (mdFiles.length === 0) return [];

  // Step 3: get commits to find most recently modified files
  const commits = await githubApi(
    `/repos/${TIL_REPO}/commits?path=${encodeURIComponent(mdFiles[0].path)}&per_page=1`
  );

  // Sort by path for now; we'll use commit info per file
  // For simplicity, get last 3 files alphabetically as a start
  // A full impl would check each file's last commit date
  const sorted = mdFiles.slice(0, MAX_ENTRIES);

  // Step 4: fetch each file's first heading as title
  const entries = [];
  for (const f of sorted) {
    const blob = await githubApi(`/repos/${TIL_REPO}/git/blobs/${f.sha}`);
    const content = Buffer.from(blob.content, "base64").toString("utf-8");
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1] : f.path.replace(/\.md$/, "");
    const slug = f.path.replace(/\.md$/, "");
    entries.push({ title, path: f.path, slug });
  }

  return entries;
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
