const express = require("express");

const route = express.Router();

const authJWT = require("../../helpers/verifyJwtToken");

const helpers = require("../../helpers/helper");

const moment = require("moment");

const { v4: uuidv4  } = require('uuid');

route.get("/collections/:rf_id/illustration", [authJWT.verifyToken], async (req, res) =>{     
    const rfID = req.params.rf_id;
    if(rfID > 0) {
        const itemDetails = await helpers.getAssignmentDataByrfID(rfID.toString().trim());
        let boxes = [], connections = [], execDate = '', execDate1 = '', fakeDate = '', recordedDate = '', title = "";
        const box = [
            {id:1,segment:0,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Inventor',shape:'rectangle'},
            {id:2,segment:1,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Ownership',shape:'rectangle'},
            {id:3,segment:2,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Security',shape:'rectangle'},
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

        if(itemDetails !== undefined && itemDetails.assignor.length > 0) {
            title = itemDetails.assignment.convey_text;
            let oldAssigneeList = [], inventorDetails, checkType = "" , type = "Ownership", boxType = 0, segment = 1;     

            itemDetails.assignor.forEach( (assignor, index) => {
                let boxName = assignor.normalize_name;
                let assignorID = assignor.id;
                if( boxName  === '' || boxName == null) {
                    boxName = assignor.or_name;
                }

                if(index === 0){
                    execDate = moment(new Date(assignor.exec_dt)).format('YYYY-MM-DD');
                    fakeDate = moment(new Date(assignor.exec_dt)).subtract(9, 'days');
                    recordedDate = moment(new Date(itemDetails.assignment.record_dt)).subtract(9, 'days');
                }
                
                let boxObj = {
                    id: assignorID.toString(),
                    name: boxName,
                    assignment_no: 0,
                    date_1: fakeDate.format('YYYY-MM-DD'),
                    execution_date: fakeDate.format('YYYY-MM-DD'),
                    recorded_date: recordedDate.format('YYYY-MM-DD'),
                    document: "https://patentrack.com/resources/shared/data/assignment-pat-" + itemDetails.assignment.reel_no + "-" + itemDetails.assignment.frame_no +".pdf",
                }          
                if(itemDetails.assignment.employer_assign === 1){
                    boxType = 0;
                    segment = 0;
                    type = 'Inventor';
                    checkType = 'Inventor';
                } else {
                    checkType = "Ownership";
                    type = "Ownership";
                    segment = 1;
                }

                inventorDetails = box.filter( x => x.type === type ? x : '');
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

                

                if(oldAssigneeList.length > 0) {
                    const findID = oldAssigneeList.filter(c => {
                        
                        if(c.name == boxName){
                            return true;
                        }
                    }).map(d => {return d.id});
                    console.log(findID);
                    if(findID.length > 0) {
                        assigneeID = findID[0];
                    }
                } 
                if(assigneeID == "") {
                    
                    assigneeID = assignee.id;
                    oldAssigneeList.push({id:assigneeID, name: boxName});
                    let checkType = "Ownership";
                    if(itemDetails.assignment.convey_ty === "security"){
                        checkType = "Security";
                    } else if(itemDetails.assignment.convey_ty === "release"){
                        checkType = "Release";
                    } else if(itemDetails.assignment.convey_ty === "namechg"){
                        checkType = "Ownership";
                    } else if(itemDetails.assignment.convey_ty === "assignment"){
                        checkType = "Ownership";
                    } else if(itemDetails.assignment.convey_ty === "correct"){
                        checkType = "Ownership";
                    }

                    boxObj = {
                        id: assigneeID,
                        name: boxName,
                        date_1: execDate,
                        assignment_no: 1,
                        execution_date: execDate,
                        recorded_date: moment(new Date(itemDetails.assignment.record_dt)).format('YYYY-MM-DD'),
                        document: "https://patentrack.com/resources/shared/data/assignment-pat-" + itemDetails.assignment.reel_no + "-" + itemDetails.assignment.frame_no +".pdf",
                    }

                    inventorDetails = box.filter( x => x.type === checkType ? x : '');
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
                let type = "assignment";
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
                            console.log(findID);
                            if(findID.length > 0) {
                                assigneeID = findID[0];
                            }
                        } 
                        if(assigneeID == "") {                           
                            assigneeID = assignee.id;
                            oldAssigneeList.push({id:assigneeID, name: boxName});
                        }
                        //boxes[boxes.length] = boxObj

                        let connectionLine = line.filter( x => x.name === type ? x : []);
                        console.log(connectionLine);
                        if(connectionLine.length > 0) {
                            let lineType = "Solid";
                            if(connectionLine[0].line_type === 1){
                                lineType = "Dashed";
                            }
                            let commentObj = {};
                            commentObj[itemDetails.assignment.reel_no + "-" +  itemDetails.assignment.frame_no] = ["",""];
                            connections.push({"id":assigneeID,"assignment_no1":1,"color":connectionLine[0].color,"type":type,"type_line":lineType,"ref_id":assignee.rf_id,"start_id":assignorID,"end_id":assigneeID,"box_creator_id":0,"box_creator_id2":0,"popup":[itemDetails.assignment.reel_no + "-" +  itemDetails.assignment.frame_no],"comment":[commentObj],"user_files":[""],"tooltip":connectionLine[0].name,"date":execDate,"document1":"https://patentrack.com/resources/shared/data/assignment-pat-"+itemDetails.assignment.reel_no + "-" +  itemDetails.assignment.frame_no+".pdf","document2":"","note1":"","pdf1":"","note2":"","pdf2":"","popuptop":itemDetails.assignment.reel_no + "-" +  itemDetails.assignment.frame_no,"popupbottom":""});
                        }
                    });
                }
            }); 
        }
        let illustrationData = await {box: boxes, connection: connections, line: connections, all_boxes: box, legend: line, box_menu: { border_color:["#e8665d","#e8a41c","#c1ed0e","#ed0e2f"], background_color:["#fae3e3","#f5f5d7","#d7f0f5","#f5d7dc"]}, general:{"background": "#000000" ,patent_number:`${rfID} ${title}`, original_number: rfID, logo_1:"",logo_2:"",copyright:""},popup:[],comment:"", fakeDate: fakeDate};
        res.status(200).json( illustrationData );		
    } else {
        res.status(400).send("Invalid number");
    }
});

module.exports = route;