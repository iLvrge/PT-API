const express = require("express"),

    route = express.Router(),

    fs = require('fs'),

    moment = require("moment");

    authJWT = require("../../helpers/verifyJwtToken"),

    helpers = require("../../helpers/helper");

route.get("/collections/:rf_id/illustration", [authJWT.verifyToken], async (req, res) =>{     
    const rfID = req.params.rf_id;
    if(rfID > 0) {
        const itemDetails = await helpers.getAssignmentDataByrfID(rfID.toString().trim());
       
        let boxes = [], connections = [], execDate = '', execDate1 = '', earliestDate = "", fakeDate = '', recordedDate = '', title = "", popup = [], inventionTitle = [], applNum = [], filingDate = [], intlRegNum = [], pctNum = [], patNum = [], publDate = [], publNum = [], issueDate = [], inventionTitleFirst = "", applNumFirst = "", filingDateFirst = "", intlPublDateFirst= "", intlRegNumFirst = "", issueDateFirst = "", patNumFirst = "", publDateFirst = "", publNumFirst = "", inventors = "", assignees = [], assigneesAddress1 = [], assigneesAddress2 = [], assigneesCity = [], assigneesState = [], assigneesCountryName = [], assigneesPostCode = [], assignors = [];
        const box = [
            {id:1,segment:0,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Inventor',shape:'rectangle'},
            {id:2,segment:1,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Ownership',shape:'rectangle'},
            {id:3,segment:2,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Security',shape:'rectangle'},
            {id:3,segment:2,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Release',shape:'rectangle'},
            {id:4,segment:3,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Licenses',shape:'rectangle'},
            {id:5,segment:3,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'3rdParties',shape:'rectangle'}
        ];

        const line = [
            {id:2,name:'Ownership',tooltip:"Ownership",color:'#E60000',line_type:0,segment:1,order_no:1,explanation:''},
            {id:3,name:'Name Change',tooltip:'Name Change',color:'#2493f2',line_type:0,segment:1,order_no:2,explanation:''},
            {id:4,name:'Security',tooltip:'Security',color:'#ffaa00',line_type:0,segment:2,order_no:3,explanation:''},
            {id:5,name:'License',tooltip:'License',color:'#E6E600',line_type:0,segment:2,order_no:4,explanation:''},
            {id:7,name:'Release',tooltip:'Release',color:'#70A800',line_type:0,segment:3,order_no:5,explanation:''},
            {id:8,name:'License End',tooltip:'License End',color:'#E38B4F',line_type:0,segment:1,order_no:6,explanation:''}
        ];

        let cdnURL = "https://s3-us-west-1.amazonaws.com/static.patentrack.com/assignments/var/www/html/beta/resources/shared/data/"; url = "https://patentrack.com/", sourceID =  "/var/www/html/beta/", mainDocument = "", document_form = "", document_agreement = "", path="resources/shared/data/", rfIDno = "";

        if(itemDetails !== undefined && itemDetails.assignor.length > 0) {
            rfIDno = "assignment-pat-" + itemDetails.assignment.reel_no + "-" + itemDetails.assignment.frame_no, ext = ".pdf"
            title = itemDetails.assignment.convey_text;
            let oldAssigneeList = [], inventorDetails, checkType = "" , type = "Ownership", boxType = 0, segment = 1;     
            itemDetails.properties.forEach( (document , index) => {
                inventionTitle.push(document.title);
                applNum.push(document.appno_doc_num ? document.appno_doc_num : 'NULL');
                filingDate.push(document.appno_date ? document.appno_date : 'NULL');
                intlRegNum.push('NULL');
                pctNum.push('NULL');
                issueDate.push(document.grant_date ? document.grant_date : 'NULL');
                patNum.push(document.grant_doc_num ? document.grant_doc_num : 'NULL');
                publDate.push(document.pgpub_date ? document.pgpub_date : 'NULL');
                publNum.push(document.pgpub_doc_num ? document.pgpub_doc_num : 'NULL');
                if(index == 0) {
                    inventionTitleFirst = document.title;
                    applNumFirst = document.appno_doc_num;
                    filingDateFirst = document.appno_date;
                    intlPublDateFirst = '0001-01-01T00:00:00Z';
                    intlRegNumFirst = "NULL";
                    issueDateFirst = document.grant_date;
                    patNumFirst = document.grant_doc_num;
                    publDateFirst = document.pgpub_date;
                    publNumFirst = document.pgpub_doc_num;
                }
            });
            
            inventors = "NULL";

            itemDetails.assignor.forEach( (assignor, index) => {
                let boxName = assignor.normalize_name;
                let assignorID = assignor.id;
                if( boxName  === '' || boxName == null) {
                    boxName = assignor.or_name;
                }

                if(index === 0){
                    execDate = moment(new Date(assignor.exec_dt)).format('YYYY-MM-DD');
                    fakeDate = moment(new Date(assignor.exec_dt)).subtract(1, 'days');
                    /*recordedDate = moment(new Date(itemDetails.assignment.record_dt)).subtract(9, 'days');*/
                    recordedDate = moment(new Date(itemDetails.assignment.record_dt));
                    earliestDate = moment(new Date(assignor.exec_dt)).format('YYYY-MM-DD');
                }

                assignors.push(boxName);
                mainDocument = cdnURL + rfIDno + ext;
                document_form = cdnURL + rfIDno + "_form" + ext;
                document_agreement = cdnURL + rfIDno + "_agreement" + ext
                
                /*if (fs.existsSync(sourceID + path + rfIDno + ext)) {
                    mainDocument = url + path + rfIDno + ext;

                    if (fs.existsSync(sourceID + path + rfIDno + "_form" + ext)) {
                        document_form = url + path + rfIDno + "_form" + ext
                    }

                    if (fs.existsSync(sourceID + path + rfIDno + "_agreement" + ext)) {
                        document_agreement = url + path + rfIDno + "_agreement" + ext
                    }
                }*/
                
                let boxObj = {
                    id: assignorID.toString(),
                    name: boxName,
                    assignment_no: 0,
                    date_1: fakeDate.format('YYYY-MM-DD'),
                    execution_date: fakeDate.format('YYYY-MM-DD'),
                    recorded_date: recordedDate.format('YYYY-MM-DD'),
                    document: "",
                    document_file: "",
                    flag: 1
                }          
                if(itemDetails.assignment.employer_assign === 1){
                    boxType = 0;
                    segment = 0;
                    type = 'Inventor';
                    checkType = 'Inventor';
                } else {
                    if(itemDetails.assignment.convey_ty === "security"){
                        checkType = "Security";
                        type = "Security";
                    } else if(itemDetails.assignment.convey_ty === "release"){
                        checkType = "Release";
                        type = "Release";
                    } else {
                        checkType = "Ownership";
                        type = "Ownership";
                    }
                    
                    segment = 1;
                }

                inventorDetails = box.filter( x => x.type == type ? x : '');
                if(inventorDetails !== ''){
                    boxObj.type = type;
                    boxObj.boxType = inventorDetails[0].id;
                    boxObj.shape = inventorDetails[0].shape;
                    boxObj.dimension = inventorDetails[0].dimension;
                    boxObj.border_color = inventorDetails[0].border_color;
                    boxObj.border_linepx = inventorDetails[0].border_px;
                    boxObj.background_color = inventorDetails[0].background_color;
                    boxObj.segment = segment.toString();
                }

                boxes.push(boxObj);
            });


            itemDetails.assignee.forEach( assignee => {
                let assigneeID = "";
                boxName = assignee.normalize_name;


                if( boxName  === '' || boxName == null) {
                    boxName = assignee.ee_name;
                }

                assignees.push(boxName);
                assigneesAddress1.push(assignee.ee_address_1);
                assigneesAddress2.push(assignee.ee_address_2);
                assigneesCity.push(assignee.ee_city);
                assigneesState.push(assignee.ee_state);
                assigneesCountryName.push(assignee.ee_country);
                assigneesPostCode.push(assignee.ee_postcode);



                if(oldAssigneeList.length > 0) {
                    const findID = oldAssigneeList.filter(c => {
                        
                        if(c.name == boxName){
                            return true;
                        }
                    }).map(d => {return d.id});
                    if(findID.length > 0) {
                        assigneeID = findID[0];
                    }
                } 
                if(assigneeID == "") {
                    
                    assigneeID = assignee.id;
                    oldAssigneeList.push({id:assigneeID, name: boxName});
                    let checkType = "Ownership";
                    type = "Ownership";
                    if(itemDetails.assignment.convey_ty === "security"){
                        checkType = "Security";
                        type = "Security";
                    } else if(itemDetails.assignment.convey_ty === "release"){
                        checkType = "Release";
                        type = "Release";
                    } else if(itemDetails.assignment.convey_ty === "namechg"){
                        checkType = "Ownership";
                        type = "Release";
                    }/*  else if(itemDetails.assignment.convey_ty === "assignment"){
                        checkType = "Ownership";
                    } else if(itemDetails.assignment.convey_ty === "correct"){
                        checkType = "Ownership";
                    } */

                    boxObj = {
                        id: assigneeID,
                        name: boxName,
                        date_1: execDate,
                        assignment_no: 1,
                        execution_date: execDate,
                        recorded_date: moment(new Date(itemDetails.assignment.record_dt)).format('YYYY-MM-DD'),
                        document: mainDocument,
                        document_file: mainDocument,
                        document_form: document_form,
                        document_agreement: document_agreement,
                        flag: 0
                    }
                    inventorDetails = box.filter( x => x.type == checkType ? x : '');
                    if(inventorDetails !== ''){
                        boxObj.type = type;
                        boxObj.boxType = inventorDetails[0].id;
                        boxObj.shape = inventorDetails[0].shape;
                        boxObj.dimension = inventorDetails[0].dimension;
                        boxObj.border_color = inventorDetails[0].border_color;
                        boxObj.border_linepx = inventorDetails[0].border_px;
                        boxObj.background_color = inventorDetails[0].background_color;
                        boxObj.segment = segment === 0 ? '1' : segment.toString();
                    }
                    boxes.push(boxObj);
                }
            });
        
            title = itemDetails.assignment.convey_text;
            
            itemDetails.assignor.forEach( (assignor, index) => {
                let assignorID = assignor.id;
                if(index === 0){
                    execDate = moment(new Date(assignor.exec_dt)).format('YYYY-MM-DD');
                    fakeDate = moment(new Date(assignor.exec_dt)).subtract(9, 'days');
                    recordedDate = moment(new Date(itemDetails.assignment.record_dt)).subtract(9, 'days');
                }
                let type = "Ownership";
                if(itemDetails.assignee.length > 0){
                    if(itemDetails.assignment.convey_ty === "security"){
                        type = "Security";
                    } else if(itemDetails.assignment.convey_ty === "release"){
                        type = "Release";
                    } else if(itemDetails.assignment.convey_ty === "namechg"){
                        type = "Name Change";
                    } else if(itemDetails.assignment.convey_ty === "assignment"){
                        type = "Ownership";
                    } else if(itemDetails.assignment.convey_ty === "correct"){
                        type = "Ownership";
                    }

                    itemDetails.assignee.forEach( assignee => {
                        boxName = assignee.normalize_name;


                        if( boxName  === '' || boxName == null) {
                            boxName = assignee.ee_name;
                        }
                        let assigneeID = "";                        
                        if(oldAssigneeList.length > 0) {
                            const findID = oldAssigneeList.filter(c => {                                
                                if(c.name == boxName){
                                    return true;
                                }
                            }).map(d => {return d.id});
                            if(findID.length > 0) {
                                assigneeID = findID[0];
                            }
                        } 
                        if(assigneeID == "") {                           
                            assigneeID = assignee.id;
                            oldAssigneeList.push({id:assigneeID, name: boxName});
                        }
                        //boxes[boxes.length] = boxObj

                        let connectionLine = line.filter( x => {
                            return x.name == type;
                        });
                        
                        if(connectionLine.length > 0) {
                            let lineType = "Solid";
                            if(connectionLine[0].line_type === 1){
                                lineType = "Dashed";
                            }
                            let commentObj = {};
                            commentObj[itemDetails.assignment.reel_no + "-" +  itemDetails.assignment.frame_no] = ["",""];
                            connections.push({id: assigneeID, assignment_no1 :1, color: connectionLine[0].color, type: type, type_line: lineType, ref_id: assignee.rf_id, start_id: assignorID, end_id: assigneeID, box_creator_id: 0, box_creator_id2:0,popup: [itemDetails.assignment.reel_no + "-" +  itemDetails.assignment.frame_no],comment: [commentObj],user_files: [""], tooltip: connectionLine[0].name, date: execDate, document1: mainDocument, document1_form: document_form, document1_agreement: document_agreement,document2: "",note1: "", pdf1: "", note2: "", pdf2: "", popuptop: itemDetails.assignment.reel_no + "-" +  itemDetails.assignment.frame_no, popupbottom: ""});
                        }
                    });
                }
            }); 
            popup = [{
                id: itemDetails.assignment.reel_no + '-' +itemDetails.assignment.frame_no,
                displayId: itemDetails.assignment.reel_no + '-' +itemDetails.assignment.frame_no,
                reelNo: itemDetails.assignment.reel_no,
                frameNo: itemDetails.assignment.frame_no,
                recordedDate: itemDetails.assignment.record_dt,
                pageCount: itemDetails.assignment.page_count,
                conveyanceText: itemDetails.assignment.convey_text,
                corrName: itemDetails.assignment.cname,
                corrAddress1: itemDetails.assignment.caddress_1,
                corrAddress2: itemDetails.assignment.caddress_2,
                patAssignorEarliestExDate: earliestDate != '' ? earliestDate : '',
                patAssignorName: assignors,
                patAssigneeName: assignees,
                patAssigneeAddress1: assigneesAddress1,
                patAssigneeAddress2: assigneesAddress2,
                patAssigneeCity: assigneesCity,
                patAssigneeState: assigneesState,
                patAssigneeCountryName: assigneesCountryName,
                patAssigneePostcode: assigneesPostCode,
                applNum: applNum,
                filingDate: filingDate,
                intlRegNum: intlRegNum,
                inventionTitle: inventionTitle, 
                issueDate: issueDate,
                patNum: patNum,
                pctNum: pctNum,
                publDate: publDate,
                publNum: publNum,
                inventors: inventors,
                applNumSize: itemDetails.properties.length,
                patNumSize: itemDetails.properties.length,
                inventionTitleFirst: inventionTitleFirst,
                applNumFirst: applNumFirst,
                filingDateFirst: filingDateFirst, 
                intlPublDateFirst: intlPublDateFirst,
                intlRegNumFirst: intlRegNumFirst,
                issueDateFirst: issueDateFirst,
                patNumFirst: patNumFirst,
                publDateFirst: publDateFirst,
                publNumFirst:  publNumFirst
            }];
            
        }
        let illustrationData = await {box: boxes, connection: connections, line: connections, all_boxes: box, legend: line, box_menu: { border_color:["#e8665d","#e8a41c","#c1ed0e","#ed0e2f"], background_color:["#fae3e3","#f5f5d7","#d7f0f5","#f5d7dc"]}, general:{"background": "#000000" ,patent_number:`${rfID} ${title}`, original_number: rfID, logo_1:"",logo_2:"",copyright:""},popup: popup,comment:"", fakeDate: fakeDate};
        res.status(200).json( illustrationData );		
    } else {
        res.status(400).send("Invalid number");
    }
});

module.exports = route;