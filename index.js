const express = require("express");
const axios = require("axios").default;
const cheerio = require("cheerio");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
const path = require("path");
const fs = require("fs");
const json2csv = require("json2csv").parse;
require("dotenv").config();

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));
const app = express();
const CSV_FILE_PATH = path.join(__dirname, "latest_travian_stats.csv");

app.use(express.static(path.join(__dirname, "public")));

let authCode = null;

// Function to authenticate and get a new authCode
async function authenticate() {
  try {
    console.log("Authenticating...");
    const response = await client.post(`${process.env.TRAVIAN_BASEURL}/api/v1/auth/login`, {
      name: process.env.TRAVIAN_USER,
      password: process.env.TRAVIAN_PWD,
      w: "2560:1440",
      mobileOptimizations: false,
    });
    authCode = response.data.code;
    await client.get(`${process.env.TRAVIAN_BASEURL}/api/v1/auth?code=${authCode}`);
    console.log("Authentication successful");
  } catch (error) {
    console.error("Authentication failed:", error.message);
    authCode = null;
    throw new Error("Authentication failed");
  }
}

// Wrapper function to ensure authentication before making requests
async function ensureAuthenticatedRequest(apiCall) {
  try {
    if (!authCode) {
      await authenticate();
    }
    return await apiCall();
  } catch (error) {
    // If authentication fails or the authCode is invalid, re-authenticate and retry once
    if (error.response && error.response.status === 401) {
      console.warn("Auth token expired, re-authenticating...");
      authCode = null;
      await authenticate();
      return await apiCall(); // Retry after re-authentication
    } else {
      throw error; // If it's not an auth issue, propagate the error
    }
  }
}

async function getStats() {
  try {
    console.log("Fetching player stats...");

    // Ensure authentication before making requests
    const initialPage = await ensureAuthenticatedRequest(() =>
      client.get(`${process.env.TRAVIAN_BASEURL}/statistics/player/overview?page=1`, {
        headers: { "Accept-Encoding": "gzip, deflate" },
      })
    );

    const $ = cheerio.load(initialPage.data);
    const lastPage = parseInt($('[class="last"]').attr("href")?.split("=").pop(), 10) || 1;

    let playersInfo = [];
    let requests = [];

    for (let i = 1; i <= lastPage; i++) {
      requests.push(
        ensureAuthenticatedRequest(() =>
          client.get(`${process.env.TRAVIAN_BASEURL}/statistics/player/overview?page=${i}`, {
            headers: { "Accept-Encoding": "gzip, deflate" },
          })
        )
      );
    }

    const responses = await Promise.allSettled(requests);

    responses.forEach((result) => {
      if (result.status === "fulfilled") {
        const $$ = cheerio.load(result.value.data);
        $$('.hover').each((_, element) => {
          playersInfo.push({
            ranking: $$(element).find('[class="ra "]').text().trim(),
            name: $$(element).find('[class="pla "]').text().trim(),
            allianz: $$(element).find('.al > a').text().trim(),
            population: $$(element).find('[class="pop "]').text().replace(/[\u202A-\u202E]/g, '').trim(),
            link: process.env.TRAVIAN_BASEURL + $$(element).find('.pla a').attr('href'),
          });
        });
      } else {
        console.error("Failed to fetch a page:", result.reason.message);
      }
    });

    const finalCSV = json2csv(playersInfo, { header: true });
    fs.writeFileSync(CSV_FILE_PATH, finalCSV);
    console.log("Player stats fetched successfully and saved.");
  } catch (error) {
    console.error("Error fetching stats:", error.message);
  }
}

app.get("/new", async (req, res) => {
  await getStats();
  res.redirect("/");
});

app.get("/i-wott-die-infos", async (req, res) => {
  await getStats(); // Always fetch new data before responding
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=travian-stats_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`);
  res.sendFile(CSV_FILE_PATH);
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

const port = process.env.PORT || 3003;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});