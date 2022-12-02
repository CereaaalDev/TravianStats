const express = require("express");
const axios = require("axios").default;
const cheerio = require("cheerio");
//Wrapper für Cookiehandling mit Axios
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
const path = require("path");
const json2csv = require("json2csv").parse;
const dotenv = require('dotenv').config();

//Cookie-Wrapper initalisieren
const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

var app = express();

//statische Webseiten ermöglichen
app.use(express.static(__dirname + "/public"));

async function getStats() {
  try {
    const response = await axios.post(process.env.LOGINURL, {
      gameworld: {
        uuid: "e2300000-6b47-11ed-6404-000000000000",
        domain: "international",
        region: "international",
        name: " International 4",
        url: "https://ts4.x1.international.travian.com/",
        registrationClosed: false,
        registrationKeyRequired: false,
        hidden: false,
        start: 1669219200,
        end: null,
        mainpageBackground: "",
        subtitle: "",
        speed: "1",
        mainpageGroups: [
          "international",
          "com",
          "us",
          "nz",
          "uk",
          "au",
          "mx",
          "ar",
          "cl",
          "br",
          "ae",
          "eg",
          "sa",
          "arabia",
          "id",
          "my",
          "vn",
          "hk",
          "tw",
          "jp",
          "ba",
          "bg",
          "hr",
          "rs",
          "si",
          "ee",
          "il",
          "gr",
          "hu",
          "it",
          "lt",
          "lv",
          "pl",
          "ro",
          "cz",
          "sk",
          "fr",
          "de",
          "es",
          "pt",
          "dk",
          "fi",
          "nl",
          "no",
          "se",
          "ru",
          "tr",
        ],
      },
      usernameOrEmail: process.env.TRAVIAN_USER,
      password: process.env.TRAVIAN_PWD,
      w: "2560:1440",
    });

    ///2.Request Token und Cookie abholen
    //Weiterleitungs-URL aus Response
    await client.post(response.data.location);

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
    let playersInfo = [];

     //Gewünschte Daten in JSON-Objekt speichern
    for (let i = 1; i <= 3; i++) {
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

    return (json2csv(playersInfo, { header: true }));
  } catch (error) {
    console.error(error);
  }
}

//Endpunkt um File herunterzuladen
app.get("/i-wott-die-infos", async (req, res) => {
  let responseCSV = await getStats();

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
  res.sendFile(path.join(__dirname + "/index.html"));
});

//Server starten
const port = process.env.PORT || 3003;
app.listen(port, () => {
  console.log(`index.js listening at http://localhost:${port}`);
});
