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
        let boxes = [], connections = [], execDate = '', execDate1 = '', fakeDate = '', title = "";
        if(itemDetails !== undefined && itemDetails.assignor.length > 0) {
            title = itemDetails.assignment.convey_text;
            itemDetails.assignor.forEach( (assignor, index) => {
                let boxName = assignor.normalize_name;
                let assignorID = uuidv4();
                if( boxName  === '' || boxName == null) {
                    boxName = assignor.or_name;
                }

                if(index === 0){
                execDate = moment(new Date(assignor.exec_dt)).format('MMM DD, YYYY');
                fakeDate = moment(new Date(assignor.exec_dt)).subtract(9, 'days');
                }
                let boxObj = {
                id: assignorID.toString(),
                name: boxName,
                execution_date: fakeDate.format('MMM DD, YYYY'),
                recorded_date: moment(new Date(itemDetails.assignment.record_dt)).format('MMM DD, YYYY'),
                document: "https://patentrack.com/resources/shared/data/assignment-pat-" + itemDetails.assignment.reel_no + "-" + itemDetails.assignment.frame_no +".pdf",
                }

                let type = "Ownership";
                let boxType = 0;
                let segment = 1;
                let inventorDetails, checkType = "";
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

                const box = [
                    {id:1,segment:0,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Inventor',shape:'rectangle'},
                    {id:2,segment:1,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Ownership',shape:'rectangle'},
                    {id:3,segment:2,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Security',shape:'rectangle'},
                    {id:4,segment:3,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'Licenses',shape:'rectangle'},
                    {id:5,segment:3,border_color:'#363636',border_px:'1',background_color:'#222222',dimension:'100x30',type:'3rdParties',shape:'rectangle'}
                ];

                const line = [
                    {id:2,name:'Ownership',color:'#E60000',line_type:0,segment:1,order_no:1,explanation:''},
                    {id:3,name:'Name Change',color:'#2493f2',line_type:0,segment:1,order_no:2,explanation:''},
                    {id:4,name:'Security',color:'#ffaa00',line_type:0,segment:2,order_no:3,explanation:''},
                    {id:5,name:'License',color:'#E6E600',line_type:0,segment:2,order_no:4,explanation:''},
                    {id:7,name:'Release',color:'#70A800',line_type:0,segment:3,order_no:5,explanation:''},
                    {id:8,name:'License End',color:'#E38B4F',line_type:0,segment:1,order_no:6,explanation:''}
                ];

                

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

                if(itemDetails.assignee.length > 0){

                if(itemDetails.assignment.convey_ty === "security"){
                    checkType = "Security";
                    type = "Security";
                    segment = 2;
                } else if(itemDetails.assignment.convey_ty === "release"){
                    checkType = "Security";
                    type = "Release";
                    segment = 2;
                } else if(itemDetails.assignment.convey_ty === "namechg"){
                    checkType = "Ownership";
                    type = "Name Change";
                    segment = 1;
                } else if(itemDetails.assignment.convey_ty === "assignment"){
                    checkType = "Ownership";
                    type = "Ownership";
                    segment = 1;
                } else if(itemDetails.assignment.convey_ty === "correct"){
                    checkType = "Ownership";
                    type = "Ownership";
                    segment = 1;
                }

                itemDetails.assignee.forEach( assignee => {
                    let assigneeID = uuidv4();
                    if( index === 0) {
                        boxName = assignee.normalize_name;


                        if( boxName  === '' || boxName == null) {
                            boxName = assignee.ee_name;
                        }

                        

                        boxObj = {
                            id: assigneeID,
                            name: boxName,
                            execution_date: execDate,
                            recorded_date: moment(new Date(itemDetails.assignment.record_dt)).format('MMM DD, YYYY'),
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
        let illustrationData = await {box: boxes, connection: connections, line: connections, all_boxes: box, legend: line, box_menu: { border_color:["#e8665d","#e8a41c","#c1ed0e","#ed0e2f"], background_color:["#fae3e3","#f5f5d7","#d7f0f5","#f5d7dc"]}, general:{"background": "#000000" ,patent_number:`${rfID} ${title}`, original_number: rfID, logo_1:"",logo_2:"",copyright:""},popup:[],comment:""};
        res.status(200).json( illustrationData );		
    } else {
        res.status(400).send("Invalid number");
    }
});

module.exports = route;