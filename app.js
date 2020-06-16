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
const validity = require("./routes/application/validity");

const timelines = require("./routes/application/timelines");

/**
 * Route for Client database
 */
const customers = require("./routes/client/customers");
const activities = require("./routes/client/activities");
const professionals = require("./routes/client/professionals");
const users = require("./routes/client/users");
const documents = require("./routes/client/documents");
const company = require("./routes/client/company");
const charts = require("./routes/client/charts");
/**
 * Route for Client Login
 */
const appLogin = require("./routes/business/login");


/**
 * Route for Admin Login
 */
const adminLogin = require("./routes/business/admin_login");
const adminCustomers = require("./routes/business/admin_customers");
const companySearch = require("./routes/business/admin_company_search");



//routes for application / client
app.use("/", appLogin);

app.use("/", validity);

app.use("/", transactions);

app.use("/", assets);

app.use("/", updates);

app.use("/", errors); 

app.use("/", activities);

app.use("/charts", charts);

app.use("/customers", customers);

app.use("/timeline", timelines);

app.use("/users", users);

app.use("/professionals", professionals);

app.use("/documents", documents);

app.use("/companies", company);

//routes for admin
app.use("/admin/", adminLogin);

app.use("/admin/", adminCustomers);

app.use("/admin/", companySearch);



//routes for client



app.use((req,res,next)=>{
    const error = new Error("Invalid route");
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