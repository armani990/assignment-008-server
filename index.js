import express from 'express'
const app = express()
const PORT = 8000



//http://localhost:8000

app.get ('/', (req,res)=>{
    res.send({message: 'server is running'})
})

app.listen(PORT, ()=> {
    console.log(`server is running at ${PORT}`)
})