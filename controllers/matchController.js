var mongoose = require("mongoose");

// get the data model for other user
var users = require("../models/userDB.js");
var usersAns = require("../models/userQDB.js");
var usersMatch = require("../models/matchDB.js");
var usersLease = require("../models/leaseDB.js");
var chats = require("../models/chatDB.js");

// -------------------------------Match Algorithm--------------------------------

// function to return all user that is a match
const runMatchAlgo = async (req, res) => {
  // enter if the user has already filled his/her questionnaire
  if (await checkQuestionnaire(req, res)) {
    // filter 1
    const idUser = req.account._id;
    const prefChange = await customisePref(req, res);
    //console.log(prefChange);
    const firstFilter = await filterOne(idUser, prefChange);
    let sortedMatchUser = [];

    // if found no matching in first filter, just get all user with same gender and nationality for now
    if (firstFilter.length === 0) {
      const userProf = await users.findOne({ accountId: idUser });
      const getAll = await users.find({
        accountId: { $ne: idUser },
        gender: userProf.gender,
        nationality: userProf.nationality,
      });
      const firstFilter = getAll.map((value) => value.accountId);
      await users.updateOne(
        { accountId: idUser },
        { $set: { matchBuffer: firstFilter } }
      );

      // sort the filter
      const secondFilter = await filterTwo(idUser, firstFilter, {});
      const finResult = secondFilter.map((value) => value.id);
      const sortResult = await users.find({ accountId: { $in: finResult } });

      // show the result in sorted order
      finResult.forEach((sortOrder) => {
        sortedMatchUser.push(
          sortResult[
            sortResult.findIndex(
              (x) => x.accountId.toString() === sortOrder.toString()
            )
          ]
        );
      });

      return res.send(sortedMatchUser);
    }

    // filter match found
    await users.updateOne(
      { accountId: idUser },
      { $set: { matchBuffer: firstFilter } }
    );
    // sort the filter
    const secondFilter = await filterTwo(idUser, firstFilter, {});
    const finResult = secondFilter.map((value) =>
      mongoose.Types.ObjectId(value.id)
    );
    const sortResult = await users.find({ accountId: { $in: finResult } });

    // show the result in sorted order
    finResult.forEach((sortOrder) => {
      sortedMatchUser.push(
        sortResult[
          sortResult.findIndex(
            (x) => x.accountId.toString() === sortOrder.toString()
          )
        ]
      );
    });

    return res.send(sortedMatchUser);

    // the user has not created his/her questionnaire
  } else {
    // should be redirect later
    return res.send("please fill the questionnaire first");
  }
};

// for customizing the preference (optional, both first and second filter)
// the api for this preference will not be used anymore
// however, since the guard has been made for default value in the pref, we decided not to delete this
const customisePref = async (req, res) => {
  let prefObj = {};
  const prefKeys = Object.keys(req.body);
  prefKeys.forEach((key) => {
    prefObj[key] = req.body[key];
  });
  return prefObj;
};

// -------------------------------Match Status--------------------------------

// check for the match status here
const clickMatch = async function (req, res) {
  const userID = req.account._id;
  const matchIDs = [req.body["id"]];
  const ans = req.body["ans"];

  const userMatch = await usersMatch.findOne({ accountId: userID });

  // new userMatch, create first
  if (userMatch === null) {
    let newUserMatch = new usersMatch({
      accountId: req.account._id,
      yes: [],
      no: [],
      chat: [],
      clickedMatch: "none",
      changeRoommee: false,
    });

    // loop each match id
    matchIDs.forEach(async (key) => {
      if (ans === "yes") {
        newUserMatch.yes.push(key.toString());
        await checkMatch(userID, key, ans);
      } else {
        newUserMatch.no.push(key.toString());
      }
    });
    // update the answer
    await newUserMatch.save();
    console.log("New user saved to Match collection.");
    // old user
  } else {
    // loop through each match id
    matchIDs.forEach(async (key) => {
      if (ans === "yes") {
        // no duplicate
        if (userMatch.yes.indexOf(key.toString()) === -1) {
          try {
            await usersMatch.updateOne(
              { accountId: userID },
              { $push: { yes: key.toString() } }
            );
            console.log("finish update yes");
          } catch (e) {
            console.log(e);
            console.log("failed to update yes ");
          }

          // userMatch.yes.push(key.toString());
          await checkMatch(userID, key.toString(), ans);
          // should not be in the no if there is in the yes list
          if (userMatch.no.indexOf(key.toString()) !== -1) {
            await usersMatch.updateOne(
              { accountId: userID },
              { $pull: { no: key.toString() } }
            );
            // userMatch.no.splice(userMatch.no.indexOf(key.toString()), 1);
          }
        }
      } else {
        if (userMatch.no.indexOf(key.toString()) === -1) {
          await usersMatch.updateOne(
            { accountId: userID },
            { $push: { no: key.toString() } }
          );
          // userMatch.no.push(key.toString());
          if (userMatch.yes.indexOf(key.toString()) !== -1) {
            await usersMatch.updateOne(
              { accountId: userID },
              { $pull: { yes: key.toString() } }
            );
            // userMatch.yes.splice(userMatch.yes.indexOf(key.toString()), 1);
            await checkMatch(userID, key.toString(), ans);
            // harus update chat nya ilang semua klo ada juga
          }
        }
      }
    });

    // update the database
    // await userMatch.save();

    console.log("user updates are saved to Match collection.");
  }
};

// after press button, can get all status
const getUserMatch = async function (req, res) {
  const userID = req.account._id;
  let returnObj = {};
  try {
    const data = await usersMatch.findOne({ accountId: userID });
    const pending = await users.find({
      accountId: {
        $in: data.yes.map((value) => mongoose.Types.ObjectId(value)),
      },
    });
    const reject = await users.find({
      accountId: {
        $in: data.no.map((value) => mongoose.Types.ObjectId(value)),
      },
    });
    returnObj.userMatchData = data;
    returnObj.pendingStatus = pending;
    returnObj.rejectStatus = reject;
    res.send(returnObj);
  } catch {
    res.send([]);
  }
};

// update if there is a match for roommee
const matchedClick = async function (req, res) {
  // should wait until the other user clicked the roommee button first to indicate
  // a match, just update in each account.

  const userOne = req.account._id;

  // this one is in string
  const userTwo = req.body.accountId;
  const checkMatchClicked = await usersMatch.findOne({
    accountId: userOne,
    clickedMatch: "none",
    chat: { $in: [userTwo] },
  });

  if (checkMatchClicked) {
    await usersMatch.updateOne(
      { accountId: userOne },
      { clickedMatch: userTwo }
    );
    const confirm = await matchConfirmation(req.account._id);

    // the other user has pressed the match click, got a roommee here
    if (confirm === "confirmed") {
      // start creating the lease here
      let newLeaseOne = usersLease({});
      let newLeaseTwo = usersLease({});
      newLeaseOne.accountId = req.account._id;
      newLeaseTwo.accountId = userTwo;
      await newLeaseOne.save();
      await newLeaseTwo.save();
      res.send(userTwo + " is you roommate now, time to meet an agent");
    } else if (confirm === "clash-properties") {
      res.send("Cannot do match, both user have properties listed");
    } else {
      res.send("Please wait for your roommee confirmation");
    }
  } else {
    // This should happen in the chat
    res.send("You already have a roommee, please remove them first");
  }
};

// remove the match clikced
const removeMatchClicked = async function (req, res) {
  // use this when the invitation for roommee is still pending
  await usersMatch.updateOne(
    { accountId: req.account._id },
    { $set: { clickedMatch: "none" } }
  );
  res.send("You have undo your clicked match");
  //const currentUser = await userMatch.function({'accountId':req.account._id});
};

// checking for confirmation from the other roommee
const matchConfirmation = async function (accountId) {
  const currentUser = await usersMatch.findOne({ accountId: accountId });
  const matchUser = await usersMatch.findOne({
    accountId: mongoose.Types.ObjectId(currentUser.clickedMatch),
    clickedMatch: { $in: accountId.toString() },
  });

  if (matchUser) {
    const userProf = await users.findOne({ accountId: accountId });
    const otherUserProf = await users.findOne({
      accountId: mongoose.Types.ObjectId(currentUser.clickedMatch),
    });
    // just for extra guard, if both roommee have a property listed, than can't have a roommee match
    if (userProf.listProperty === true && otherUserProf.listProperty === true) {
      return "clash-properties";
    }

    await users.updateOne(
      { accountId: accountId },
      { roommee: matchUser.accountId }
    );
    await users.updateOne(
      { accountId: mongoose.Types.ObjectId(currentUser.clickedMatch) },
      { roommee: accountId }
    );
    return "confirmed";
  } else {
    return "not-confirmed";
  }
};

// remove roommee
const removeRoommee = async function (req, res) {
  // ini keknya perlu confirmation juga deh, tambahin!!!

  const user = await users.findOne({ accountId: req.account._id });
  const confirm = await removeConfirmation(req, res, user);

  if (confirm === "remove") {
    // update removal for other match user as well
    await usersMatch.updateOne(
      { accountId: mongoose.Types.ObjectId(user.roommee) },
      { $set: { clickedMatch: "none", changeRoommee: false } }
    );
    await users.updateOne(
      { accountId: mongoose.Types.ObjectId(user.roommee) },
      { $set: { roommee: "none" } }
    );

    // update removal for the user
    await usersMatch.updateOne(
      { accountId: req.account._id },
      { $set: { clickedMatch: "none", changeRoommee: false } }
    );
    await users.updateOne(
      { accountId: req.account._id },
      { $set: { roommee: "none" } }
    );

    //check if the updte has been conducted successfully or not
    const confirmRemove = await users.findOne({ accountId: req.account._id });

    if (confirmRemove.roommee === "none") {
      // delete the lease as well
      await usersLease.deleteOne({ accountId: req.account._id });
      res.send("Roommee has been removed, please find a new one");
    } else {
      res.send("failed to remove roommee, please try again");
    }
  } else {
    res.send("Please wait for the other roommee confirmation");
  }
};

// get confirmation for roommee removal
const removeConfirmation = async (req, res, user) => {
  await usersMatch.updateOne(
    { accountId: req.account._id },
    { $set: { changeRoommee: true } }
  );

  // ntar harus ganti se ini jadi list, soale bisa match lebih dari 2
  const matchId = user.roommee;
  const matchStats = await usersMatch.findOne({
    accountId: mongoose.Types.ObjectId(matchId),
  });
  if (matchStats.changeRoommee === true) {
    return "remove";
  } else {
    return "no";
  }
};

// get the current user roommee
const getMyRoommee = async (req, res) => {
  const user = await users.findOne({ accountId: req.account._id });
  if (user.roommee !== "none") {
    const roommeeProf = await users.findOne({
      accountId: mongoose.Types.ObjectId(user.roommee),
    });
    res.send(roommeeProf);
  } else {
    res.send("please find a roommee first");
  }
};
// -------------------------------Helper Function--------------------------------

// check if there is a chat match
const checkMatch = async function (userID, matchID, ans) {
  const matchRes = await usersMatch.findOne({
    accountId: mongoose.Types.ObjectId(matchID),
    yes: { $in: userID.toString() },
  });
  // Enable chat
  if (matchRes) {
    if (matchRes.chat.indexOf(userID) === -1) {
      if (ans === "yes") {
        // CREATE the chat room here
        await addRoom(userID, matchID);
        await usersMatch.updateOne(
          { accountId: mongoose.Types.ObjectId(matchID) },
          { $push: { chat: userID.toString() } }
        );
        await usersMatch.updateOne(
          { accountId: userID },
          { $push: { chat: matchID.toString() } }
        );
      }
    } else {
      if (ans === "no") {
        // DELETE the chat room here

        await removeRoom(userID, matchID);
        await usersMatch.updateOne(
          { accountId: mongoose.Types.ObjectId(matchID) },
          { $pull: { chat: userID.toString() } }
        );
        await usersMatch.updateOne(
          { accountId: userID },
          { $pull: { chat: matchID.toString() } }
        );
      }
    }
  }
};

// filter one
const filterOne = async function (userID, pref) {
  // query the user profile and questionaire
  const user = await users.findOne({ accountId: userID });
  const userQ = await usersAns.findOne({ accountId: userID });

  // set the query object
  let userQueryObject = {};
  let questionQueryObject = {};

  // essential data needed for other user
  userQueryObject.accountId = { $ne: userID };
  userQueryObject.roommee = "none";

  // for preference
  let prefFilter = pref;

  // essential data needed for other user questionaire answer
  questionQueryObject.accountId = { $ne: userID };
  // questionQueryObject["filter1.numRoommeePref"] = userQ.filter1.numRoommeePref;
  questionQueryObject["filter1.ageDiffRange"] = user.age;

  // by default
  if (Object.keys(pref).length === 0) {
    prefFilter = userQ.filter1;
  }
  // single value filter
  if (prefFilter.sameNationalityPref === "yes") {
    userQueryObject.nationality = user.nationality;
  }
  if (prefFilter.sameGenderPref === "yes") {
    userQueryObject.gender = user.gender;
  }
  if (prefFilter.petsPref === "yes") {
    questionQueryObject["filter1.petsPref"] = "yes";
  }

  // multiple value filter
  if (prefFilter.sameLocationPref === "yes") {
    userQueryObject.preferStay = { $in: user.preferStay };
  }
  if (prefFilter.sameLangPref === "yes") {
    userQueryObject.language = { $in: user.language };
  }

  // query the other user data
  const userMatches = await users.find(userQueryObject);
  const userQMatches = await usersAns.find(questionQueryObject);

  const idOne = userMatches.map((value) => value.accountId.toString());
  const idTwo = userQMatches.map((value) => value.accountId.toString());
  const matchID = idOne.filter((value) => idTwo.includes(value));

  return matchID;
};

// sorting the filter one
const filterTwo = async function (userID, matchID, sortOption) {
  const queryID = { accountId: { $in: matchID } };
  let result = [];
  // query user and other matches
  const user = await usersAns.findOne({ accountId: userID });
  const filterOneMatches = await usersAns.find(queryID);
  let comparison;

  // iterate each match from filterOne and calc distance
  filterOneMatches.forEach((match) => {
    comparison = {};
    comparison.id = match.accountId;
    comparison.distance = euclidean(user.filter2, match.filter2, sortOption);
    result.push(comparison);
  });
  //sort filter_2
  const sortResult = await sortMatch(result);

  return sortResult;
};

// check guard for matching, need user questionaire before do matching
const checkQuestionnaire = async (req, res) => {
  const userQ = await usersAns.findOne({ accountId: req.account._id });
  if (userQ) {
    return true;
  }
  return false;
};

// used after user have done a match algo
const sortOption = async function (req, res) {
  let sortedMatchUser = [];

  const idUser = req.account._id;
  const pref = await customisePref(req, res);
  const user = await users.findOne({ accountId: idUser });
  const matchID = user.matchBuffer;

  const secondFilter = await filterTwo(idUser, matchID, pref);
  const finResult = secondFilter.map((value) =>
    mongoose.Types.ObjectId(value.id)
  );
  const sortResult = await users.find({ accountId: { $in: finResult } });

  // show the result in sorted order
  finResult.forEach((sortOrder) => {
    sortedMatchUser.push(
      sortResult[
        sortResult.findIndex(
          (x) => x.accountId.toString() === sortOrder.toString()
        )
      ]
    );
  });

  res.render("matchProfile", {
    sortedMatchUser: sortedMatchUser,
    idUser: idUser,
  });
};

const sortMatch = async function (result) {
  result.sort(function (a, b) {
    return a.distance - b.distance;
  });
  return result;
};

// euclidean distance function
function euclidean(user1, user2, sortOption) {
  var distance = 0;
  if (Object.keys(sortOption).length === 0) {
    // iterate each keys in filter 2
    for (var key of Object.keys(user1)) {
      distance += Math.pow(user1[key] - user2[key], 2);
    }
    return Math.sqrt(distance);
  } else {
    for (var key of Object.keys(sortOption)) {
      distance += Math.pow(user1[key] - user2[key], 2);
    }
    return Math.sqrt(distance);
  }
}

// these functions are for chat room manipulation
const addRoom = async (userIDOne, userIDTwo) => {
  console.log("create room");
  const newChat = new chats({});
  const userOne = await users.findOne({ accountId: userIDOne });
  const userTwo = await users.findOne({ accountId: userIDTwo });
  const roomName = userIDOne.toString() + userIDTwo.toString();

  // set the name for the room
  newChat.name = roomName;
  newChat.users = [userOne.firstName, userTwo.firstName];

  let userOneNewChat = {};
  let userTwoNewChat = {};

  // set the object first for update
  userOneNewChat.roomName = roomName;
  userOneNewChat.listUsers = [userIDTwo];
  userOneNewChat.nameUsers = [userTwo.firstName];

  userTwoNewChat.roomName = roomName;
  userTwoNewChat.listUsers = [userIDOne];
  userTwoNewChat.nameUsers = [userOne.firstName];

  try {
    await users.updateOne(
      { accountId: userIDOne },
      { $push: { roomList: userOneNewChat } }
    );
    await users.updateOne(
      { accountId: userIDTwo },
      { $push: { roomList: userTwoNewChat } }
    );
    console.log(newChat);
    await newChat.save();
  } catch (e) {
    console.log(e);
    console.log("failed update and create room ");
  }
};

// Delete the room if the user decided to end their match status
const removeRoom = async (userIDOne, userIDTwo) => {
  // try to find the room name first
  const userProf = await users.findOne({ accountId: userIDOne });
  const userOne = await users.findOne({ accountId: userIDOne });
  const userTwo = await users.findOne({ accountId: userIDTwo });

  const listOfRooms = userProf.roomList;
  var deleteUserOneRoom = {};
  var deleteUserTwoRoom = {};
  let deleteRoom = "";

  listOfRooms.forEach((room) => {
    if (room.listUsers.indexOf(userIDTwo.toString()) !== -1) {
      deleteRoom = room.roomName;
      deleteUserOneRoom.roomName = room.roomName;
      deleteUserOneRoom.listUsers = [userIDTwo];
      deleteUserOneRoom.nameUsers = [userTwo.firstName];
      deleteUserTwoRoom.roomName = room.roomName;
      deleteUserTwoRoom.listUsers = [userIDOne];
      deleteUserTwoRoom.nameUsers = [userOne.firstName];
    }
  });

  if (deleteRoom !== "") {
    try {
      await chats.deleteOne({ name: deleteRoom });
      await users.updateOne(
        { accountId: userIDOne },
        { $pull: { roomList: deleteUserOneRoom } }
      );
      await users.updateOne(
        { accountId: userIDTwo },
        { $pull: { roomList: deleteUserTwoRoom } }
      );
    } catch (e) {
      console.log(e);
      console.log("failed to delete room and update the user room list");
    }
  }
};

module.exports = {
  runMatchAlgo,
  clickMatch,
  getUserMatch,
  matchedClick,
  removeRoommee,
  removeMatchClicked,
  getMyRoommee,
  sortOption,
};
