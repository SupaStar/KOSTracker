const config = require('./variables');
const { MongoClient } = require('mongodb');
const puppeteer = require('puppeteer');
const Agenda = require('agenda');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const moment = require('moment-timezone');

const { mongoConexion, tokenTelegram } = config;

const agenda = new Agenda({ db: { address: mongoConexion } });
const client = new MongoClient(mongoConexion);
const bot = new TelegramBot(tokenTelegram, { polling: false });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

agenda.define("comprobarExistencias", async (job) => {
    await ejecutarComprobacion();
});

(async function () {
    await agenda.start();
    console.log("Bot iniciado con éxito");
    await agenda.every("60 minutes", "comprobarExistencias");
})();

async function ejecutarComprobacion() {
    console.log("Ejecutando comprobación de existencias");
    const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: true });

    try {
        const page = await browser.newPage();
        await page.goto('https://www.kosbeauty.mx/tienda/?v=12fd81cd143d');
        await delay(2000);
        await page.waitForSelector('.products.elementor-grid.columns-4');

        const productAvailability = await obtenerProductosDisponibles(page);

        const db = client.db("Info");
        const collection = db.collection(`log-dia-${new Date().getDate()}`);
        await guardarLogEjecucion(collection);

        await notificarProductosDisponibles(productAvailability);

        await browser.close();
    } catch (error) {
        console.error('Error durante la ejecución:', error);
        await browser.close();
    }
}

async function obtenerProductosDisponibles(page) {
    const productAvailability = await page.evaluate(() => {
        const products = [];
        const productItems = document.querySelectorAll('.products.elementor-grid.columns-4 > li');

        productItems.forEach((item) => {
            const isOutOfStock = item.querySelector('.ast-shop-product-out-of-stock') !== null;
            const priceElement = item.querySelector('.price > .woocommerce-Price-amount')?.textContent;
            const name = item.querySelector('.woocommerce-loop-product__title')?.textContent;

            if (priceElement) {
                const price = priceElement;
                products.push({ name, price, isOutOfStock });
            }
        });

        return products;
    });

    return productAvailability;
}

async function guardarLogEjecucion(collection) {
    const row = {
        data: `El bot se ejecutó correctamente a las ${obtenerFechaHora()} horas`
    };

    await collection.insertOne(row);
}

async function notificarProductosDisponibles(productAvailability) {
    const lipsticksAvailable = productAvailability.filter(product =>
        product.name.includes('LIPSTICK') && !product.isOutOfStock
    );

    if (lipsticksAvailable.length > 0) {
        console.log('Existen productos disponibles');
        const botMessage = generarMensajeProductos(lipsticksAvailable);
        await enviarMensajes(botMessage);
    }
    console.log('No hay productos disponibles');
}

async function enviarMensajes(message) {
    try {
        const urlApi = `${config.botUrlMessages}`;
        const response = await axios.get(urlApi);
        const chats = response.data.result.map((message) => message.message.chat.id);

        chats.forEach((chat) => {
            bot.sendMessage(chat, message);
            console.log('Mensaje enviado con éxito a Telegram');
        });
    } catch (error) {
        console.error('Error al enviar el mensaje a Telegram:', error.message);
    }
}

function obtenerFechaHora() {
    const now = moment().tz('America/Mexico_City');
    return now.format('DD/MM/YYYY HH:mm:ss');
}

function generarMensajeProductos(products) {
    return "Hay existencia de los siguientes productos: \n" +
        products.map(product => `${product.name} ${product.price}\n`).join('');
}
