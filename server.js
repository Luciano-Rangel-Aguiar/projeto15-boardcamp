import cors from 'cors'
import dayjs from 'dayjs'
import customParseFormat from './node_modules/dayjs/plugin/customParseFormat.js'
import dotenv from 'dotenv'
import express from 'express'
import pg from 'pg'
import joi from 'joi'

dotenv.config()
dayjs.extend(customParseFormat)

const server = express()
server.use(cors())
server.use(express.json())

const { Pool } = pg
const connection = new Pool({
  connectionString: process.env.DATABASE_URL
})

const categoriesSchema = joi.object({
  name: joi.string().required()
})

const gamesSchema = joi.object({
  name: joi.string().required(),
  image: joi.string().required(),
  stockTotal: joi.number().min(1).required(),
  categoryId: joi.string().required(),
  pricePerDay: joi.number().min(1).required()
})

const customersSchema = joi
  .object({
    name: joi.string().required(),
    phone: joi
      .string()
      .min(10)
      .max(11)
      .pattern(/^[0-9]+$/)
      .required(),
    cpf: joi
      .string()
      .length(11)
      .pattern(/^[0-9]+$/)
      .required(),
    birthday: joi.string().required()
  })
  .custom(obj => {
    const dateValid = dayjs(obj.birthday, 'YYYY-MM-DD', true).isValid()
    if (!dateValid) {
      throw new Error(
        'Date format is invalid, valid format should be "YYYY-MM-DD".'
      )
    }
  })

const rentalsReqSchema = joi.object({
  customerId: joi.number().required(),
  gameId: joi.number().required(),
  daysRented: joi.number().required()
})

//CRUD de Categorias

server.get('/categories', async (req, res) => {
  const categoriesList = await connection.query('SELECT * FROM categories;')
  res.send(categoriesList.rows)
})

server.post('/categories', async (req, res) => {
  const { name } = req.body

  const valid = categoriesSchema.validate({
    name
  })

  if (valid.error) {
    return res.send(400)
  }

  const newName = req.body.name

  try {
    const nameExists = await connection.query(
      'SELECT name FROM categories WHERE name = $1;',
      [newName]
    )

    if (nameExists.rows.length > 0) {
      return res.send(409)
    }

    await connection.query('INSERT INTO categories (name) VALUES ($1);', [
      newName
    ])

    return res.send(201)
  } catch {
    return res.send(500)
  }
})

//CRUD de Jogos

server.get('/games', async (req, res) => {
  const gamesList = await connection.query(
    'SELECT games.*, categories.name AS "categoryName" FROM games JOIN categories ON games."categoryId" = categories.id;'
  )

  res.send(gamesList.rows)
})

server.post('/games', async (req, res) => {
  const { name, image, stockTotal, categoryId, pricePerDay } = req.body

  const valid = gamesSchema.validate({
    name,
    image,
    stockTotal,
    categoryId,
    pricePerDay
  })

  if (valid.error) {
    return res.send(400)
  }

  try {
    const idExist = await connection.query(
      'SELECT id FROM categories WHERE id = $1;',
      [categoryId]
    )

    if (idExist.rows.length <= 0) {
      return res.send(400)
    }

    await connection.query(
      'INSERT INTO games (name, image, "stockTotal", "categoryId", "pricePerDay") VALUES ($1,$2,$3,$4,$5);',
      [name, image, stockTotal, categoryId, pricePerDay]
    )

    return res.send(201)
  } catch {
    return res.send(500)
  }
})

//CRUD de Clientes

server.get('/customers', async (req, res) => {
  const customersList = await connection.query('SELECT * FROM customers;')

  return res.send(customersList.rows)
})

server.post('/customers', async (req, res) => {
  const { name, phone, cpf, birthday } = req.body

  const valid = customersSchema.validate({
    name,
    phone,
    cpf,
    birthday
  })

  if (valid.error) {
    return res.send(400)
  }
  try {
    const cpfExists = await connection.query(
      'SELECT cpf FROM customers WHERE cpf = $1;',
      [cpf]
    )

    if (cpfExists.rows.length > 0) {
      return res.send(409)
    }

    await connection.query(
      'INSERT INTO customers ("name", "phone", "cpf", "birthday") VALUES ($1,$2,$3,$4);',
      [name, phone, cpf, birthday]
    )

    return res.send(201)
  } catch {
    return res.send(500)
  }
})

server.put('/customers/:id', async (req, res) => {
  const { name, phone, cpf, birthday } = req.body

  const id = req.params.id

  console.log(id)

  const oldCustumer = await connection.query(
    'SELECT * FROM customers WHERE id = $1;',
    [id]
  )

  const valid = customersSchema.validate({
    name,
    phone,
    cpf,
    birthday
  })

  if (valid.error) {
    return res.send(400)
  }

  const oldCpf = await connection.query(
    'SELECT cpf FROM customers WHERE cpf = $1;',
    [cpf]
  )

  if (oldCpf.rows.length <= 0) {
    try {
      const cpfExists = await connection.query(
        'SELECT cpf FROM customers WHERE cpf = $1;',
        [cpf]
      )

      if (cpfExists.rows.length > 0) {
        return res.send(409)
      }
    } catch {
      return res.send(500)
    }
  }

  try {
    await connection.query(
      'UPDATE customers SET name=$1, phone=$2, cpf=$3, birthday=$4 WHERE id = $5;',
      [name, phone, cpf, birthday, id]
    )

    return res.send(201)
  } catch {
    return res.send(500)
  }
})

//CRUD de Aluguéis

server.get('/rentals', async (req, res) => {
  try {
    const rentalsList = await connection.query(
      'SELECT * FROM rentals JOIN customers ON customers.id=rentals."customerId" JOIN games ON games.id=rentals."gameId"'
    )

    return res.send(rentalsList.rows)
  } catch {
    return res.send(500)
  }
})

server.post('/rentals', async (req, res) => {
  const { customerId, gameId, daysRented } = req.body

  const valid = rentalsReqSchema.validate({
    customerId,
    gameId,
    daysRented
  })

  if (valid.error) {
    return res.send(400)
  }
  try {
    const date = dayjs(Date.now()).format('YYYY-MM-DD')

    const gamePrice = await connection.query(
      'SELECT "pricePerDay" FROM games WHERE id = $1;',
      [gameId]
    )

    const price = gamePrice.rows[0].pricePerDay * daysRented

    const customerExists = await connection.query(
      'SELECT id FROM customers WHERE id = $1;',
      [customerId]
    )

    if (customerExists.rows.length <= 0) {
      return res.send(400)
    }

    const gameExists = await connection.query(
      'SELECT id FROM games WHERE id = $1;',
      [gameId]
    )

    if (gameExists.rows.length <= 0) {
      return res.send(400)
    }

    if (daysRented <= 0) {
      return res.send(400)
    }

    const stock = await connection.query(
      'SELECT "stockTotal" FROM games WHERE id = $1;',
      [gameId]
    )

    const rentedGames = await connection.query(
      'SELECT * FROM rentals WHERE "gameId" = $1;',
      [gameId]
    )

    console.log(rentedGames.rows)

    if (rentedGames.rows.length >= stock.rows[0].stockTotal) {
      return res.send(400)
    }

    await connection.query(
      'INSERT INTO rentals ("customerId", "gameId", "rentDate", "daysRented", "originalPrice") VALUES ($1,$2,$3,$4,$5);',
      [customerId, gameId, date, daysRented, price]
    )

    return res.send(201)
  } catch {
    return res.send(500)
  }
})

server.post('/rentals/:id/return', async (req, res) => {
  const id = req.params.id

  try {
    const rentalExists = await connection.query(
      'SELECT id FROM rentals WHERE id = $1;',
      [id]
    )

    if (rentalExists.rows.length > 0) {
      return res.send(404)
    }

    const rental = await connection.query(
      'SELECT * FROM rentals WHERE id = $1',
      [id]
    )

    if (!rental.rows[0].returnDate) {
      return res.send(400)
    }

    const rentDate = rental.rows[0].rentDate
    const daysRented = rental.rows[0].daysRented
    const pricePerDay = rental.rows[0].originalPrice / daysRented

    const returnDate = dayjs(Date.now()).format('YYYY-MM-DD')

    const expectedReturnDate = dayjs(rentDate)
      .add(daysRented, 'day')
      .format('YYYY-MM-DD')

    const diff = dayjs(returnDate).diff(dayjs(expectedReturnDate), 'day')

    let delayFee = null

    if (diff > 0) {
      delayFee = pricePerDay * diff
    }

    await connection.query(
      'UPDATE rentals SET "returnDate"=$1, "delayFee"=$2 WHERE id = $3;',
      [returnDate, delayFee, id]
    )

    return res.send(201)
  } catch {
    return res.send(500)
  }
})

server.delete('/rentals/:id', async (req, res) => {
  const id = req.params.id

  try {
    const rentalExists = await connection.query(
      'SELECT id FROM rentals WHERE id = $1;',
      [id]
    )

    if (rentalExists.rows.length > 0) {
      return res.send(404)
    }

    const rental = await connection.query(
      'SELECT * FROM rentals WHERE id = $1',
      [id]
    )

    if (!rental.rows[0].returnDate) {
      return res.send(400)
    }

    await connection.query('DELETE FROM rentals WHERE id = $1;', [id])
  } catch {
    return res.send(500)
  }
})

server.listen(process.env.PORT, () => {
  console.log(`listen on port ${process.env.PORT}`)
})
