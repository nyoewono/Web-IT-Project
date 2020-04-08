const express = require('express');

// add our router
const router = express.Router();

// require each controller
const matchController = require('../controllers/matchController.js');
const profileController = require('../controllers/profileController.js');
const loginController = require('../controllers/loginController');
const qController = require('../controllers/qController.js');

// handle all get management

// already login homepage
router.get("/login-homepage/:id", (req, res) => {loginController.userHomePage(req, res)});

// Profile and Questionaire handler

// ----------------------------questionaire-----------------------------
// ask the user questionaire
router.get('/questionaire/new/:id', (req, res) =>{
    const userID = req.params.id;
    res.render("questionaireForm", {userID:userID});
});
// save the questionaire answer of user with specified id
router.post("/questionaire/new/:id", (req, res) => {qController.addAnswerQ(req, res)});
// get the questionaire answer for user
router.get("/questionaire/:id", (req, res) => {
    const userID = req.params.id;
    let usersAns = require('../model/usersQuestionaire');
    let userAns = usersAns.find(user=>user.id==userID);
    if(userAns===undefined){
        res.redirect("/questionaire/new/"+userID);
    }else{
        qController.getUserQuestionaire(req, res);
    }
});

// update the user questionaire answer
router.get("/questionaire/update/:id", (req, res) =>{
    var userID = req.params.id;
    var qAns = require("../model/usersQuestionaire.js");
    qAns = qAns.find(user => user.id==userID);
    res.render("userQuestionaireUpdate", {qAns:qAns});
})
router.post("/questionaire/update/:id", (req, res) => {qController.updateUserQuestionaire(req, res)});
// ----------------------------------------------------------------------

// -------------------------------profile-------------------------------- 
// fill the user profile
router.get("/profile/new", (req, res) => {res.render("profileForm")});
// save the user profile
router.post("/profile/new", (req, res) => {profileController.newUserProfile(req, res)});
// get the profile for user
router.get("/profile/:id", (req, res) => {profileController.getUserProfile(req, res)});
// fill the update for user profile 
router.get("/profile/update/:id", (req, res) => {
    var userID = req.params.id;
    var users = require("../model/users.js");
    res.render("userProfileUpdate", {userID:userID, users:users});
})
// update the user profile
router.post("/profile/update/:id", (req, res) => {profileController.updateUserProfile(req, res)});
// ----------------------------------------------------------------------

// -------------------------------Core Functionality-------------------------------- 
// Core Functionality: Matching system
// get the match for user with specified id
router.get("/get-match/:id", (req, res) => {matchController.getMatchUsers(req, res)});
// chat system
router.get("/chat", (req, res) => {
    res.send("Not yet done for chat");
})
// ----------------------------------------------------------------------------------

// for save keeping 
router.get('/*', (req, res)=>{
    res.send('Sorry, no page found for this url');
});

// export router
module.exports = router;