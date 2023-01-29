const express = require("express");
const axios = require("axios").default;
const cheerio = require("cheerio");
//Wrapper für Cookiehandling mit Axios
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
const path = require("path");
const json2csv = require("json2csv").parse;
const dotenv = require("dotenv").config();

//Cookie-Wrapper initalisieren
const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

var app = express();

var finalCSV = "";

//statische Webseiten ermöglichen
app.use(express.static(__dirname + "/public"));

app.get("/new", function (req, res) {
  newStats();
  //res.send('HTTP200');
  res.redirect("/");
  //res.sendStatus(200);
});

async function newStats() {
  console.log(process.env.TRAVIAN_BASEURL);
  const body = {
    name: process.env.TRAVIAN_USER,
    password: process.env.TRAVIAN_PWD,
    w: "2560:1440",
    mobileOptimizations: false,
  };
  console.log(body);

  const response = await axios.post(
    process.env.TRAVIAN_BASEURL + "/auth/login",
    body
  );
  console.log(response.data);
  const authCode = response.data.code;
  const response2 = await axios.get(
    `${process.env.TRAVIAN_BASEURL}/auth?code=${authCode}`
  );
  console.log(response2.data);

  const get3 = await client.get(
    "https://ts4.x1.international.travian.com/statistics/player/overview?page=1",
    {
      headers: {
        "Accept-Encoding": null,
      },
    }
  );

  console.log(get3.data);
}

async function getStats() {
  try {
    console.log("Abfragen gestartet");

    //1. Login mit Username Passwort
    const loginResponse = await client.post(
      process.env.TRAVIAN_BASEURL + "/auth/login",
      {
        name: process.env.TRAVIAN_USER,
        password: process.env.TRAVIAN_PWD,
        w: "2560:1440",
        mobileOptimizations: false,
      }
    );
    const authCode = loginResponse.data.code;

    //2. JWT-Token abholen
    const authResponse = await client.get(
      `${process.env.TRAVIAN_BASEURL}/auth?code=${authCode}`
    );

    // 3. Request Statisik abfragen (Datenformatierung ausschaten für parsing)
    const get3 = await client.get(
      "https://ts4.x1.international.travian.com/statistics/player/overview?page=1",
      {
        headers: {
          "Accept-Encoding": null,
        },
      }
    );

    //Nummer der letzten Seite abfragen
    let $ = cheerio.load(get3.data);
    let linkLastPage = $('[class="last"]').attr("href");
    const lastPage = linkLastPage.substring(linkLastPage.indexOf("=") + 1);
    console.log(lastPage);
    let playersInfo = [];

    //Gewünschte Daten in JSON-Objekt speichern
    for (let i = 1; i <= lastPage; i++) {
      const statReq = await client.get(
        `https://ts4.x1.international.travian.com/statistics/player/overview?page=${i}`,
        {
          headers: {
            "Accept-Encoding": null,
          },
        }
      );

      $ = cheerio.load(statReq.data);
      //Für jeden Eintrag die gewünschen Infos holen
      $('[class="hover"]').each(function (index, element) {
        let ranking = $(element).find('[class="ra "]').text();
        let name = $(element).find('[class="pla "]').text();
        let alianz = $(element).find('[class="al "]').text();
        let population = $(element).find('[class="pop "]').text();

        playersInfo.push({
          ranking: ranking,
          name: name,
          allianz: alianz,
          population: population,
        });
      });
    }

    //Daten in CSV Umwandeln
    finalCSV = json2csv(playersInfo, { header: true });
    console.log("Abfragen beendet");
  } catch (error) {
    console.error(error);
  }
}

//Endpunkt um File herunterzuladen
app.get("/i-wott-die-infos", async (req, res) => {
  await getStats();
  let responseCSV = finalCSV;

  //Zeitstempel generieren
  const time = Date.now();
  const date = new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  const timeStamp = year + month + day + "-" + hour + minute + second;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=travian-stats_" + timeStamp + ".csv"
  );
  res.send(responseCSV.toString()).end();
});

//Startseite anzeigen
app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname + "/public/index.html"));
});

//Server starten
const port = process.env.PORT || 3003;
app.listen(port, () => {
  console.log(`index.js listening at Port ${port}`);
});
