var mongoose = require("mongoose");

// get the data model for other user
var users = require('../models/userDB.js');
var usersAns = require('../models/userQDB.js');
var usersMatch = require('../models/matchDB.js');

// -------------------------------Match Algorithm--------------------------------

// function to return all user that is a match
const runMatchAlgo = async (req, res) => {

    // filter 1
    const idUser = req.account._id
    const firstFilter = await filterOne(idUser);
    
    // if found no matching in first filter, just get all user with same gender and nationality for now
    if(firstFilter.length===0){
        const userProf = await users.findOne({'accountId':idUser});
        const getAll = await users.find({'accountId':{$ne:idUser}, 'gender':userProf.gender, 'nationality':userProf.nationality});
        const firstFilter = getAll.map(value => value.accountId);

        // sort the filter
        const secondFilter = await filterTwo(idUser, firstFilter);
        const finResult = secondFilter.map(value => value.id);
        const sortedMatchUser = await users.find({'accountId':{$in:finResult}});
        res.render('matchProfile', {sortedMatchUser:sortedMatchUser, idUser:idUser});
    }

    // sort the filter
    const secondFilter = await filterTwo(idUser, firstFilter);
    const finResult = secondFilter.map(value => mongoose.Types.ObjectId(value.id));
    const sortedMatchUser = await users.find({'accountId':{$in:finResult}});
    res.render('matchProfile', {sortedMatchUser:sortedMatchUser, idUser:idUser});
};

// -------------------------------Match Status-------------------------------- 

// check for the match status here
const clickMatch = async function(req, res){
    
    console.log('masuk controller');
    const userID = req.account._id;
    const matchIDs = Object.keys(req.body);
    const userMatch = await usersMatch.findOne({'accountId':userID});

    
    // new userMatch, create first
    if(userMatch===null){
        
        let newUserMatch = new usersMatch({
            accountId:req.account._id,
            yes:[],
            no:[],
            chat:[],
            clickedMatch:"none",
            changeRoommee:false
        });

        // loop each match id
        matchIDs.forEach(key => {
            const ans = req.body[key];
            if(ans==='yes'){
                newUserMatch.yes.push(key.toString());
                checkMatch(userID, key, ans);
            }else{
                newUserMatch.no.push(key.toString());
            }
        });
        // update the answer
        newUserMatch.save(function (err, userMatch){
            if(err){
                console.error('err');
            }else{
                console.log(userMatch);
                console.log("New user saved to Match collection.");
                res.redirect("/user-match/status");
            }
        });
    // old user
    }else{
        // loop through each match id
        matchIDs.forEach(key => {
            const ans = req.body[key];
            
            if(ans==='yes'){
                // no duplicate
                if(userMatch.yes.indexOf(key.toString())===-1){
                    userMatch.yes.push(key.toString());
                    checkMatch(userID, key.toString(), ans);
                    // should not be in the no if there is in the yes list
                    if(userMatch.no.indexOf(key.toString())!==-1){
                        userMatch.no.splice(userMatch.no.indexOf(key.toString()), 1);
                    }
                }

            }else{
                if(userMatch.no.indexOf(key.toString())===-1){
                    userMatch.no.push(key.toString())
                    if(userMatch.yes.indexOf(key.toString())!==-1){
                        userMatch.yes.splice(userMatch.yes.indexOf(key.toString()), 1);
                        checkMatch(userID, key.toString(), ans);
                        // harus update chat nya ilang semua klo ada juga 
                    }
                }
            }
        });
        // update the database
        userMatch.save(function(err, data){
            if(err){
                res.status(400);
                res.send('failed update match')
            }else{
                res.redirect("/user-match/status");
            }
        });
    }
}

// after press button, can get all status
const getUserMatch = async function(req, res){
    const userID = req.account._id;
    const data = await usersMatch.findOne({'accountId':userID});
    const pending = await users.find({'accountId':{$in:data.yes.map(value=>mongoose.Types.ObjectId(value))}});
    const reject = await users.find({'accountId':{$in:data.no.map(value=>mongoose.Types.ObjectId(value))}});
    res.render('matchStatus', {data:data, pending:pending, reject:reject});
};

// update if there is a match for roommee
const matchedClick = async function(req, res){
    
    // should wait until the other user clicked the roommee button first to indicate
    // a match, just update in each account.

    const userOne = req.account._id;

    // this one is in string
    const userTwo = req.body.accountId;

    const checkMatchClicked = await usersMatch.findOne({"accountId":userOne, "clickedMatch":"none", 'chat':{$in:[userTwo]}});
    
    if(checkMatchClicked){
        await usersMatch.updateOne({accountId:userOne}, {'clickedMatch':userTwo});
        const confirm = await matchConfirmation(req.account._id);

        // check one more time if it still work or not
        if(confirm==='confirmed'){
            res.send(userTwo + " is you roommate now, time to meet an agent");
        }else{
            res.send('Please wait for your roommee confirmation');
        }

    }else{
        res.send("You already have a roommee, please remove them first");
    }
    
}

// remove the match clikced
const removeMatchClicked = async function(req, res){

    await usersMatch.updateOne({'accountId':req.account._id}, {$set:{'clickedMatch':"none"}});
    res.send('You have undo your clicked match');
    //const currentUser = await userMatch.function({'accountId':req.account._id});

}

// checking for confirmation from the other roommee
const matchConfirmation = async function (accountId){
    
    const currentUser = await usersMatch.findOne({'accountId':accountId});
    const matchUser = await usersMatch.findOne({'accountId':mongoose.Types.ObjectId(currentUser.clickedMatch), clickedMatch:{$in:accountId.toString()}});

    if(matchUser){
        await users.updateOne({'accountId':accountId}, {'roommee':matchUser.accountId});
        await users.updateOne({'accountId':mongoose.Types.ObjectId(currentUser.clickedMatch)}, {'roommee':accountId});
        return 'confirmed'
    }else{
        return 'not-confirmed'
    }
}

// remove roommee
const removeRoommee = async function (req, res){
    // ini keknya perlu confirmation juga deh, tambahin!!!
    
    const user = await users.findOne({'accountId':req.account._id});
    const confirm = await removeConfirmation(req, res, user);
    
    if(confirm==='remove'){

        // update removal for other match user as well
        await usersMatch.updateOne({'accountId':mongoose.Types.ObjectId(user.roommee)}, {$set:{'clickedMatch':'none', 'changeRoommee':false}});
        await users.updateOne({'accountId':mongoose.Types.ObjectId(user.roommee)}, {$set:{'roommee':'none'}});
        
        // update removal for the user
        await usersMatch.updateOne({'accountId':req.account._id}, {$set:{'clickedMatch':'none', 'changeRoommee':false}});
        await users.updateOne({'accountId':req.account._id}, {$set:{'roommee':'none'}});

        //check if the updte has been conducted successfully or not
        const confirmRemove = await users.findOne({'accountId':req.account._id});
        if(confirmRemove.roommee==='none'){
            res.send('Roommee has been removed, please find a new one');
        }else{
            res.send('failed to remove roommee, please try again');
        }
    }else{
        res.send('Please wait for the other roommee confirmation');
    }
}

// get confirmation for roommee removal
const removeConfirmation = async (req, res, user) => {
    
    await usersMatch.updateOne({'accountId':req.account._id}, {$set:{'changeRoommee':true}});

    // ntar harus ganti se ini jadi list, soale bisa match lebih dari 2
    const matchId = user.roommee;
    const matchStats = await usersMatch.findOne({'accountId':mongoose.Types.ObjectId(matchId)});
    if(matchStats.changeRoommee===true){
        return 'remove'
    }else{
        return 'no'
    }

}

// get the current user roommee
const getMyRoommee = async (req, res) => {

    const user = await users.findOne({"accountId":req.account._id});
    if(user.roommee!=='none'){
        const roommeeProf = await users.findOne({"accountId":mongoose.Types.ObjectId(user.roommee)});
        res.send(roommeeProf);
    }else{
        res.send('please find a roommee first');
    }

}
// -------------------------------Helper Function-------------------------------- 

// check if there is a chat match
const checkMatch = async function(userID, matchID, ans){
    
    console.log('enter');
    const matchRes = await usersMatch.findOne({'accountId':mongoose.Types.ObjectId(matchID), 'yes':{$in:userID.toString()}});
    // Enable chat 
    if(matchRes){
        if(matchRes.chat.indexOf(userID)===-1){
            if(ans==='yes'){
                await usersMatch.updateOne({'accountId':mongoose.Types.ObjectId(matchID)}, {$push:{'chat':userID.toString()}});
                await usersMatch.updateOne({'accountId':userID}, {$push:{'chat':matchID.toString()}});
            }
        }else{
            if(ans==='no'){
                await usersMatch.updateOne({'accountId':mongoose.Types.ObjectId(matchID)}, {$pull:{'chat':userID.toString()}});
                await usersMatch.updateOne({'accountId':userID}, {$pull:{'chat':matchID.toString()}});
            }
        }
    };
};

// filter one
const filterOne = async function(userID){
    
    // query the user profile and questionaire
    const user = await users.findOne({accountId:userID});
    const userQ = await usersAns.findOne({accountId:userID});

    // set the query object
    let userQueryObject = {};
    let questionQueryObject = {};

    // essential data needed for other user
    userQueryObject.accountId = {$ne:userID};
    userQueryObject.roommee = 'none';

    // essential data needed for other user questionaire answer
    questionQueryObject.accountId = {$ne:userID};
    questionQueryObject['filter1.numRoommeePref'] = userQ.filter1.numRoommeePref;
    questionQueryObject['filter1.ageDiffRange'] = user.age;
    
    // single value filter
    if(userQ.filter1.sameNationalityPref==='yes'){
        userQueryObject.nationality = user.nationality;
    }
    if(userQ.filter1.sameGenderPref==='yes'){
        userQueryObject.gender = user.gender;
    }
    if(userQ.filter1.petsPref==='yes'){
        questionQueryObject['filter1.petsPref']='yes';
    }

    // multiple value filter
    if(userQ.filter1.sameLocationPref==='yes'){
        userQueryObject.preferStay = {$in:user.preferStay};
    }
    if(userQ.filter1.sameLangPref==='yes'){
        userQueryObject.language = {$in:user.language};
    }
    
    // query the other user data
    const userMatches = await users.find(userQueryObject);
    const userQMatches = await usersAns.find(questionQueryObject);

    //console.log(userMatches);
    //console.log(userQMatches);

    const idOne = userMatches.map(value => value.accountId.toString());
    const idTwo = userQMatches.map(value => value.accountId.toString());
    const matchID = idOne.filter(value => idTwo.includes(value));

    return matchID;
}

// sorting the filter one
const filterTwo = async function(userID, matchID){

    const queryID = {accountId: {$in: matchID}};
    let result = [];
    // query user and other matches
    const user = await usersAns.findOne({accountId:userID});
    const filterOneMatches = await usersAns.find(queryID);
    let comparison;
    
    // iterate each match from filterOne and calc distance
    filterOneMatches.forEach(match => {
        comparison = {};
        comparison.id = match.accountId;
        comparison.distance = euclidean(user.filter2, match.filter2);
        result.push(comparison);
    })
    //sort filter_2
    const sortResult = await sortMatch(result);

    return sortResult;
}

const sortMatch = async function(result){
    
    result.sort(function(a, b){
        return a.distance - b.distance;
    })
    return result
}

// euclidean distance function 
function euclidean(user1, user2){

    var distance = 0;
    // iterate each keys in filter 2 
    for(var key of Object.keys(user1)){
        distance += Math.pow((user1[key]-user2[key]),2);
    }
    return Math.sqrt(distance)
}


module.exports={
    runMatchAlgo,
    clickMatch,
    getUserMatch,
    matchedClick,
    removeRoommee,
    removeMatchClicked,
    getMyRoommee
};