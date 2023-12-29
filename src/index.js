const config = require('./variables');
const { MongoClient } = require('mongodb');
const puppeteer = require('puppeteer');
const Agenda = require('agenda');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const moment = require('moment-timezone');

const mongoConexion = config.mongoConexion;
const tokenTelegram = config.tokenTelegram;

const agenda = new Agenda({ db: { address: mongoConexion } });
const client = new MongoClient(mongoConexion);
const bot = new TelegramBot(tokenTelegram, { polling: false }); // Configura el bot con polling desactivado

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

var botMessage = "";
agenda.define("comprobarExistencias", async (job) => {
    ejecucion();
});

(async function () {
    await agenda.start();
    console.log("Bot iniciado con exito");
    await agenda.every("60 minutes", "comprobarExistencias");
})();

// ejecucion();

async function ejecucion() {
    console.log("Ejecutando comprobacion de existencias");
    const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: true });
    const page = await browser.newPage();
    page.goto('https://www.kosbeauty.mx/tienda/?v=12fd81cd143d');
    await delay(2000);
    await page.waitForSelector('.products.elementor-grid.columns-4');
    const productAvailability = await page.evaluate(() => {
        const products = [];
        // Seleccionar todos los elementos li dentro de la lista de productos
        const productItems = document.querySelectorAll('.products.elementor-grid.columns-4 > li');

        productItems.forEach((item) => {
            // Verificar si el producto está agotado
            const isOutOfStock = item.querySelector('.ast-shop-product-out-of-stock') !== null;

            // Obtener el precio de cada producto
            const priceElement = item.querySelector('.price > .woocommerce-Price-amount')?.textContent;
            const name = item.querySelector('.woocommerce-loop-product__title')?.textContent;
            if (priceElement) {
                const price = priceElement;
                products.push({ name, price, isOutOfStock });
            }
        });

        return products;
    });
    console.log(productAvailability);
    var lipsticksAvaliable = [];
    productAvailability.forEach((product) => {
        if (product.name.includes('LIPSTICK') && product.isOutOfStock == false) {
            lipsticksAvaliable.push(product);
        }
    });
    const db = client.db("Info");
    const collection = db.collection(`log-dia-${day}-${month}-${year}`);
    row = {
        data: "El bot se ejecutó correctamente a las " + obtenerFechaHora() + " horas",
    }
    await collection.insertOne(row);
    try {
        if (lipsticksAvaliable.length > 0) {
            botMessage = "Hay existencia de los siguientes productos: \n";
            lipsticksAvaliable.forEach((product) => {
                botMessage += product.name + " " + product.price + "\n";
            });
            await enviarMensajes();
        }
        await browser.close();
    } catch (error) {
        console.log(error);
    }
}

async function enviarMensajes() {
    const urlApi = `${config.botUrlMessages}`;
    const response = await axios.get(urlApi);
    const chats = response.data.result.map((message) => message.message.chat.id);
    chats.forEach((chat) => {
        try {
            bot.sendMessage(chat, botMessage);
            console.log('Mensaje enviado con éxito a Telegram');
          } catch (error) {
            console.error('Error al enviar el mensaje a Telegram:', error.message);
          }
    });
}
function obtenerFechaHora() {
    const now = moment().tz('America/Mexico_City');
    const day = now.format('DD');
    const month = now.format('MM');
    const year = now.format('YYYY');
    const hours = now.format('HH');
    const minutes = now.format('mm');
    const seconds = now.format('ss');

    const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    return formattedDate;
}