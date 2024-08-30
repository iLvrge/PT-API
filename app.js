//Express server
require("./helpers/instrument"); 

const express = require("express");

const cors = require("cors");

const bodyParser = require("body-parser");

const Sentry = require('@sentry/node'); 

const upload = require("express-fileupload");

const socket = require("./socket");

const { logErrorToFile } = require('./helpers/logErrors');
const requestLogger = require('./helpers/requestLogger');

// load the agent 

const app = express();
 
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());

app.use(express.json({limit: '100mb', type:'application/json'}));
app.use(express.urlencoded({limit: '100mb', extended:false, parameterLimit:100000, type:'application/x-www-form-urlencoded'}));

app.use(bodyParser.json({limit: '100mb', type:'application/json'}));
app.use(bodyParser.urlencoded({limit: '100mb', extended:false, parameterLimit:100000, type:'application/x-www-form-urlencoded'}));

app.use(upload());
app.set('trust proxy', true)
/* app.use(cors({
    origin: '*',
    methods: ['GET','POST','DELETE','PUT','PATCH', 'OPTIONS'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

app.options('*', cors())  

app.use(function(req, res, next) {
   res.header("Access-Control-Allow-Origin", "*");
   res.header('Access-Control-Allow-Methods', 'DELETE, PUT, GET, POST, OPTIONS, PATCH');
   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
   next();
}); */

// enable cors
app.use(
    cors({
        origin: '*',
        exposedHeaders: '*',
        optionsSuccessStatus: 200,
        credentials: true,
    })
  );
/* app.options(
    '*',
    cors({
        origin: '*',
        exposedHeaders: '*',
        optionsSuccessStatus: 200,
        credentials: true,
    })
); */
app.options('*', (req, res) => {
    res.writeHead(200, '', {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS',
    }).end();
});
/* app.use((req, res, next) => { //doesn't send response just adjusts it
    res.header("Access-Control-Allow-Origin", "*") //* to give access to any origin
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization" //to give access to all the headers provided
    );
    if(req.method === 'OPTIONS'){
        res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET'); //to give access to all the methods provided
        return res.status(200).json({});
    }
    next(); //so that other routes can take over
}) */

/**nginx client_max_body_size 100M; #100mb */
app.use(requestLogger);
const port = process.env.PORT || 4200;
/**
 * Route for Applications database
 */
const transactions = require("./routes/application/transactions");
const illustration = require("./routes/application/illustration");
const family = require("./routes/application/family");
const share = require("./routes/application/share");
const assets = require("./routes/application/assets");
const updates = require("./routes/application/updates");
const errors = require("./routes/application/errors");
const validity = require("./routes/application/validity");
const events = require("./routes/application/events");
const timelines = require("./routes/application/timelines");
const search = require("./routes/application/search");
const entity = require("./routes/application/entity");
const externalapi = require("./routes/application/externalapi");
const dashboards = require("./routes/application/dashboards");
/**
 * Route for Client database
 */
const customers = require("./routes/client/customers");
const tabs = require("./routes/client/tabs");
const tree = require("./routes/client/tree");
const activities = require("./routes/client/activities");
const comments = require("./routes/client/comments");
const professionals = require("./routes/client/professionals");
const users = require("./routes/client/users");
const category_products = require("./routes/client/category_products");
const documents = require("./routes/client/documents");
const company = require("./routes/client/company");
const address = require("./routes/client/address");
const telephone = require("./routes/client/telephone");
const lawfirm = require("./routes/client/lawfirm");
const lawfirm_address = require("./routes/client/lawfirm_address");
const slacks = require("./routes/client/slacks");
const microsoft = require("./routes/client/microsoft");

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

const svgFlagIcons = require('./routes/application/svg_flag_icon');

const userCompanySelections = require('./routes/business/user_company_selections');
const userActivitySelection = require('./routes/business/user_activity_selection');


//routes for application / client
app.use("/", appLogin);

app.use("/", profile);

app.use("/", validity);

app.use("/", transactions);

app.use("/", illustration);

app.use("/", family);

app.use("/", share);

app.use("/", assets);

app.use("/", updates);

app.use("/", errors); 

app.use("/", activities);

app.use("/", comments);

app.use("/", collections);

app.use("/", events);

app.use("/", externalapi);

app.use("/", userCompanySelections);

app.use("/", userActivitySelection);

app.use("/dashboards", dashboards);

app.use('/events_icons', svgFlagIcons);

app.use('/search', search);

app.use('/entity', entity);

app.use("/slacks", slacks);

app.use("/microsoft", microsoft);

app.use("/charts", charts);

app.use("/tabs", tabs);

app.use("/tree", tree);

app.use("/customers", customers);

app.use("/timeline", timelines);

app.use("/users", users);

app.use("/category_products", category_products);

app.use("/professionals", professionals);

app.use("/documents", documents);

app.use("/companies", company);

app.use("/", address);

app.use("/", telephone);

app.use("/", lawfirm);

app.use("/", lawfirm_address);

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
    logErrorToFile('--------Invalid route----------');
    logErrorToFile('Invalid route'); 
    next(error);
})

//------------- error message
app.use((error, req, res, next)=>{
    logErrorToFile('--------Global Error----------');
    logErrorToFile(error.message); 
    res.status(error.status || 500);
    res.json({
        "error": {
            "message": error.message
        }
    })
});

process.on('uncaughtException', (err) => {
    logErrorToFile('--------uncaughtException----------');
    logErrorToFile(err); 
    process.exit(1); 
});

process.on('unhandledRejection', (reason, promise) => {
    logErrorToFile('--------unhandledRejection----------');
    logErrorToFile(reason);  
    Sentry.captureException(reason); 
});

//listen function for Node / express
const server = app.listen({port, host:'0.0.0.0'}, ()=>{
    console.log(`The server is running on port: ${port}`);
})

try{
    socket.connect(server); 
} catch (err) {
    logErrorToFile('--------Error in socket connect----------');
    logErrorToFile(err);   
} 