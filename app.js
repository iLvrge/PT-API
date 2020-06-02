//Express server
const express = require("express");

const cors = require("cors");

const bodyParser = require("body-parser");

const app = express();

const upload = require("express-fileupload");

app.use(upload());

app.use(cors());

app.use(bodyParser.urlencoded({extended:false}));

app.use(bodyParser.json());

const port = process.env.PORT || 3600;
/**
 * Route for Applications database
 */
const transactions = require("./routes/application/transactions");
const assets = require("./routes/application/assets");
const updates = require("./routes/application/updates");
const errors = require("./routes/application/errors");


/**
 * Route for Client Login
 */
const appLogin = require("./routes/business/login");


/**
 * Route for Admin Login
 */
const adminLogin = require("./routes/business/admin_login");
const customers = require("./routes/business/admin_customers");
const companySearch = require("./routes/business/admin_company_search");


//routes for application
app.use("/", transactions);

app.use("/", assets);

app.use("/", updates);

app.use("/", errors);


//routes for admin
app.use("/admin/", adminLogin);

app.use("/admin/", customers);

app.use("/admin/", companySearch);



//routes for client
app.use("/", appLogin);

app.use((req,res,next)=>{
    const error = new Error("Unable to manage the request");
    //send a status code error
    error.status= 404;
    //forward the request with the error
    next(error);
})

//------------- error message
app.use((error, req, res, next)=>{
    res.status(error.status || 500);
    res.json({
        "error": {
            "message": error.message
        }
    })
});

//listen function for Node / express
app.listen(port, ()=>{
    console.log("The server is running");
})