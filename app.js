//Express server
const express = require("express");

const cors = require("cors");

const bodyParser = require("body-parser");

const app = express();

const upload = require("express-fileupload");

app.use(express.json({limit: '100mb', type:'application/json'}));
app.use(express.urlencoded({limit: '100mb', extended:false, parameterLimit:100000, type:'application/x-www-form-urlencoded'}));

app.use(bodyParser.json({limit: '100mb', type:'application/json'}));
app.use(bodyParser.urlencoded({limit: '100mb', extended:false, parameterLimit:100000, type:'application/x-www-form-urlencoded'}));

app.use(upload());

app.use(cors());

/**nginx client_max_body_size 100M; #100mb */

const port = process.env.PORT || 3600;
/**
 * Route for Applications database
 */
const transactions = require("./routes/application/transactions");
const illustration = require("./routes/application/illustration");
const share = require("./routes/application/share");
const assets = require("./routes/application/assets");
const updates = require("./routes/application/updates");
const errors = require("./routes/application/errors");
const validity = require("./routes/application/validity");

const timelines = require("./routes/application/timelines");

/**
 * Route for Client database
 */
const customers = require("./routes/client/customers");
const tabs = require("./routes/client/tabs");
const activities = require("./routes/client/activities");
const comments = require("./routes/client/comments");
const professionals = require("./routes/client/professionals");
const users = require("./routes/client/users");
const documents = require("./routes/client/documents");
const company = require("./routes/client/company");
const address = require("./routes/client/address");
const telephone = require("./routes/client/telephone");
const lawyer = require("./routes/client/lawyer");

const charts = require("./routes/client/charts");
const collections = require("./routes/client/collections");
/**
 * Route for Client Login
 */
const appLogin = require("./routes/business/login");

const profile = require("./routes/business/profile");


/**
 * Route for Admin Login
 */
const adminLogin = require("./routes/business/admin_login");
const adminCustomers = require("./routes/business/admin_customers");
const companySearch = require("./routes/business/admin_company_search");
const companyTree = require("./routes/business/admin_tree");
const keywords = require("./routes/business/admin_keywords");



//routes for application / client
app.use("/", appLogin);

app.use("/", profile);

app.use("/", validity);

app.use("/", transactions);

app.use("/", illustration);

app.use("/", share);

app.use("/", assets);

app.use("/", updates);

app.use("/", errors); 

app.use("/", activities);

app.use("/", comments);

app.use("/", collections);

app.use("/charts", charts);

app.use("/tabs", tabs);

app.use("/customers", customers);

app.use("/timeline", timelines);

app.use("/users", users);

app.use("/professionals", professionals);

app.use("/documents", documents);

app.use("/companies", company);

app.use("/", address);

app.use("/", telephone);

app.use("/", lawyer);

//routes for admin
app.use("/admin/", adminLogin);

app.use("/admin/", adminCustomers);

app.use("/admin/", companySearch);

app.use("/admin/", companyTree);

app.use("/admin/", keywords);



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