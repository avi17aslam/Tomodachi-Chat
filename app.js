
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  orderBy,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

  
import {
  getDatabase,
  ref as rtdbRef,
  onValue,
  onDisconnect,
  set,
  push,
  remove,
  serverTimestamp as rtdbServerTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";


const firebaseConfig = {
  apiKey: "AIzaSyDyfLrA9s5oow8YvcDzAoLynJvqIljgGzk",
  authDomain: "tomodachi-chat.firebaseapp.com",
  projectId: "tomodachi-chat",
  storageBucket: "tomodachi-chat.firebasestorage.app",
  messagingSenderId: "577306794980",
  appId: "1:577306794980:web:81946f3092b5fb3ac385f1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


const realtimeDb = getDatabase(
  app,
  "https://tomodachi-chat-default-rtdb.asia-southeast1.firebasedatabase.app"
);


const provider = new GoogleAuthProvider();

const loginScreen = document.getElementById("loginScreen");
const chatScreen = document.getElementById("chatScreen");
const loginButton = document.getElementById("googleLogin");
const message = document.getElementById("message");
const signOutButton = document.getElementById("signOutButton");

const myPhoto = document.getElementById("myPhoto");
const myName = document.getElementById("myName");
const userSearch = document.getElementById("userSearch");
const searchButton = document.getElementById("searchButton");
const searchMessage = document.getElementById("searchMessage");
const searchResults = document.getElementById("searchResults");
const chatList = document.getElementById("chatList");

const emptyChat = document.getElementById("emptyChat");
const activeChat = document.getElementById("activeChat");
const friendPhoto = document.getElementById("friendPhoto");
const friendName = document.getElementById("friendName");
const friendEmail = document.getElementById("friendEmail");
const messagesList = document.getElementById("messagesList");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const chatNotice = document.getElementById("chatNotice");

let currentUser = null;
let activeFriend = null;
let unsubscribeMessages = null;
let unsubscribeChats = null;
let unsubscribePreviewListeners = new Map();
let presenceUnsubscribe = null;
let presenceConnectionRef = null;
let unsubscribeFriendPresence = null;
let busy = false;
const markingReadMessages = new Set();

function showError(text) {
  chatNotice.textContent = text;
}

function makeAvatar(photoURL, name) {
  const img = document.createElement("img");
  img.className = "avatar";
  img.alt = `${name || "User"} profile photo`;

  if (photoURL) {
    img.src = photoURL;
  } else {
    img.style.display = "none";
  }

  return img;
}

function makeFriendButton(user, container) {
  const button = document.createElement("button");
  button.className = "friend-item";
  button.dataset.friendUid = user.uid;

  button.appendChild(makeAvatar(user.photoURL, user.displayName));

 

const details = document.createElement("span");

const name = document.createElement("strong");
name.textContent = user.displayName || "Tomodachi User";
details.appendChild(name);

if (container === chatList) {
  // Chat List: show latest message instead of email
  const preview = document.createElement("small");
  preview.className = "last-message-preview";
  preview.textContent = user.lastMessage || "No messages yet";
  details.appendChild(preview);
} else {
  // Search Results: show friend's email
  const email = document.createElement("small");
  email.textContent = user.email || "";
  details.appendChild(email);
}

button.appendChild(details);


if (container === chatList) {
  const lastTime = document.createElement("small");
  lastTime.className = "last-message-time";
  lastTime.textContent = user.lastMessageTime || "";
  button.appendChild(lastTime);
}


  button.addEventListener("click", () => openChat(user));
  container.appendChild(button);
}

function stopMessageListener() {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
}

function stopChatListener() {
  if (unsubscribeChats) {
    unsubscribeChats();
    unsubscribeChats = null;
  }
}


function watchLatestMessage(chatId, friendUid) {
  const existingListener = unsubscribePreviewListeners.get(chatId);

  if (existingListener) {
    existingListener();
  }

  const latestMessageQuery = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "desc"),
    limit(1)
  );

  const unsubscribe = onSnapshot(
    latestMessageQuery,
    (snapshot) => {
      const friendButton = chatList.querySelector(
        `.friend-item[data-friend-uid="${friendUid}"]`
      );

      if (!friendButton) return;

      const preview = friendButton.querySelector(
        ".last-message-preview"
      );

      const lastTime = friendButton.querySelector(
        ".last-message-time"
      );

      if (snapshot.empty) {
        if (preview) preview.textContent = "No messages yet";
        if (lastTime) lastTime.textContent = "";
        return;
      }

      const data = snapshot.docs[0].data();

      if (preview) {
        preview.textContent = data.text || "No messages yet";
      }

      if (lastTime) {
        if (data.createdAt?.toDate) {
          lastTime.textContent =
            data.createdAt.toDate().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            });
        } else {
          lastTime.textContent = "";
        }
      }
    },
    (error) => {
      console.error("Latest message preview error:", error);
    }
  );

  unsubscribePreviewListeners.set(chatId, unsubscribe);
}


  


function loadChatList() {
  if (!currentUser) return;

  stopChatListener();

  const chatsQuery = query(
    collection(db, "chats"),
    where("participants", "array-contains", currentUser.uid)
  );

  unsubscribeChats = onSnapshot(
    chatsQuery,
    async (snapshot) => {
      chatList.replaceChildren();

      if (snapshot.empty) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent =
          "No chats yet. Search for a friend to start chatting.";
        chatList.appendChild(empty);
        return;
      }

      const friends = [];

      for (const chatDoc of snapshot.docs) {
        const participants = chatDoc.data().participants || [];
        const friendUid = participants.find(
          (uid) => uid !== currentUser.uid
        );

        if (!friendUid) continue;

        try {
          const profileSnap = await getDoc(
            doc(db, "publicProfiles", friendUid)
          );

          if (profileSnap.exists()) {
            friends.push(profileSnap.data());
          } else {
           
const lastMessageQuery = query(
  collection(db, "chats", chatDoc.id, "messages"),
  orderBy("createdAt", "desc"),
  limit(1)
);

const lastMessageSnapshot = await getDocs(lastMessageQuery);

const lastMessage = lastMessageSnapshot.empty
  ? ""
  : (lastMessageSnapshot.docs[0].data().text || "");

if (profileSnap.exists()) {
  friends.push({
    ...profileSnap.data(),
    chatId: chatDoc.id,
    lastMessage: lastMessage
  });
} else {
  friends.push({
    uid: friendUid,
    displayName: "Tomodachi User",
    email: "",
    photoURL: "",
    chatId: chatDoc.id,
    lastMessage: lastMessage
  });
}

          }
        } catch (error) {
          console.error("Friend profile error:", error);
        }
      }

      chatList.replaceChildren();

      if (friends.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No chats available yet.";
        chatList.appendChild(empty);
        return;
      }

     
friends.forEach((friend) => {
  makeFriendButton(friend, chatList);

  const chatId =
    friend.chatId ||
    [currentUser.uid, friend.uid].sort().join("_");

  if (friend.uid && chatId) {
    watchLatestMessage(chatId, friend.uid);
  }
});

    },
    (error) => {
      console.error("Chat list error:", error);
      chatList.textContent =
        "Could not load chats. Check Firestore Rules.";
    }
  );
}


onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  loginScreen.hidden = Boolean(user);
  chatScreen.hidden = !user;
  loginButton.textContent = user ? "Sign out" : "Continue with Google";

  if (!user) {
    stopMessageListener();
    stopChatListener();
    activeFriend = null;
    message.textContent = "Sign in to start chatting.";
    return;
  }

  myName.textContent = user.displayName || user.email || "Tomodachi User";
  myPhoto.src = user.photoURL || "";
  myPhoto.style.visibility = user.photoURL ? "visible" : "hidden";

  try {
   
const profile = {
  uid: user.uid,
  displayName: user.displayName || "Tomodachi User",
  email: (user.email || "").toLowerCase(),
  photoURL: user.photoURL || ""
};

await setDoc(
  doc(db, "users", user.uid),
  {
    ...profile,
    lastSeen: serverTimestamp()
  },
  { merge: true }
);

await setDoc(
  doc(db, "publicProfiles", user.uid),
  profile,
  { merge: true }
);


    message.textContent = "Profile saved.";
  } catch (error) {
    console.error("Profile save error:", error);
    message.textContent = "Could not save profile. Check Firestore Rules.";
  }
  loadChatList();
  startPresence();
});

loginButton.addEventListener("click", async () => {
  if (busy) return;

  busy = true;
  loginButton.disabled = true;

  try {
    if (currentUser) {
      await signOut(auth);
    } else {
      message.textContent = "Signing in...";
      await signInWithPopup(auth, provider);
    }
  } catch (error) {
    console.error("Authentication error:", error);
    message.textContent = "Login failed: " + error.message;
  } finally {
    busy = false;
    loginButton.disabled = false;
  }
});


signOutButton.addEventListener("click", async () => {
  await stopPresence();

  stopMessageListener();
  stopChatListener();

  await signOut(auth);
});


searchButton.addEventListener("click", searchUsers);

userSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchUsers();
});


async function searchUsers() {
  if (!currentUser) return;

  const email = userSearch.value.trim().toLowerCase();

  if (!email) {
    searchMessage.textContent = "Enter a friend's email address.";
    return;
  }

  searchButton.disabled = true;
  searchMessage.textContent = "Searching...";
  searchResults.replaceChildren();

  try {
    const usersQuery = query(
      collection(db, "publicProfiles"),
      where("email", "==", email)
    );

    const result = await getDocs(usersQuery);
    let found = false;

    result.forEach((userDoc) => {
      const user = userDoc.data();

      if (user.uid !== currentUser.uid) {
        makeFriendButton(user, searchResults);
        found = true;
      }
    });

    searchMessage.textContent = found
      ? "Select your friend to open a chat."
      : "No user found. Ask your friend to sign in again.";

  } catch (error) {
    console.error("User search error:", error);
    searchMessage.textContent =
      "Search failed. Check Firestore Rules and Console.";
  } finally {
    searchButton.disabled = false;
  }
}

function formatChatDate(date) {
  const messageDate = new Date(date);
  const today = new Date();
  const yesterday = new Date();

  yesterday.setDate(today.getDate() - 1);

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  if (isSameDay(messageDate, today)) {
    return "Today";
  }

  if (isSameDay(messageDate, yesterday)) {
    return "Yesterday";
  }

  return messageDate.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}
  

function startPresence() {
  if (!currentUser) return;

  if (presenceUnsubscribe) {
    presenceUnsubscribe();
    presenceUnsubscribe = null;
  }

  const uid = currentUser.uid;

  const connectedRef = rtdbRef(
    realtimeDb,
    ".info/connected"
  );

  const connectionsRef = rtdbRef(
    realtimeDb,
    `status/${uid}/connections`
  );

  const lastChangedRef = rtdbRef(
    realtimeDb,
    `status/${uid}/last_changed`
  );

  presenceUnsubscribe = onValue(
    connectedRef,
    async (snapshot) => {
      if (snapshot.val() !== true) return;

      try {
        presenceConnectionRef = push(connectionsRef);

        // Register offline actions before setting online
        await onDisconnect(presenceConnectionRef).remove();

        await onDisconnect(lastChangedRef).set(
          rtdbServerTimestamp()
        );

        // Register this browser as online
        await set(presenceConnectionRef, true);

        console.log("Tomodachi: You are online.");
      } catch (error) {
        console.error("Presence error:", error);
      }
    }
  );
}


async function stopPresence() {
  const uid = currentUser?.uid;

  // Stop listening to connection changes
  if (presenceUnsubscribe) {
    presenceUnsubscribe();
    presenceUnsubscribe = null;
  }

  if (!uid) {
    presenceConnectionRef = null;
    return;
  }

  const lastChangedRef = rtdbRef(
    realtimeDb,
    `status/${uid}/last_changed`
  );

  try {
    // Remove this browser's online connection
    if (presenceConnectionRef) {
      await remove(presenceConnectionRef);
      presenceConnectionRef = null;
    }

    // Save the logout time
    await set(lastChangedRef, rtdbServerTimestamp());

    console.log("Tomodachi: You are offline.");
  } catch (error) {
    console.error("Stop presence error:", error);
  }
}


function watchFriendPresence(friendUid) {
  if (unsubscribeFriendPresence) {
    unsubscribeFriendPresence();
    unsubscribeFriendPresence = null;
  }

  const connectionsRef = rtdbRef(
    realtimeDb,
    `status/${friendUid}/connections`
  );

  const lastChangedRef = rtdbRef(
    realtimeDb,
    `status/${friendUid}/last_changed`
  );

  let isOnline = false;
  let lastChanged = null;

  function updatePresenceDisplay() {
    if (isOnline) {
      friendEmail.textContent = "Online";
    } else if (lastChanged) {
      const lastSeenDate = new Date(lastChanged);

      friendEmail.textContent =
        "Last seen " +
        lastSeenDate.toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
    } else {
      friendEmail.textContent = "Offline";
    }
  }

  const stopConnections = onValue(
    connectionsRef,
    (snapshot) => {
      isOnline = snapshot.exists();
      updatePresenceDisplay();
    },
    (error) => {
      console.error("Friend online status error:", error);
      friendEmail.textContent = "Status unavailable";
    }
  );

  const stopLastChanged = onValue(
    lastChangedRef,
    (snapshot) => {
      lastChanged = snapshot.val();
      updatePresenceDisplay();
    },
    (error) => {
      console.error("Friend last seen error:", error);
    }
  );

  unsubscribeFriendPresence = () => {
    stopConnections();
    stopLastChanged();
  };
}


async function markMessagesAsRead(chatId, snapshot) {
  if (!currentUser) return;

  const unreadMessages = snapshot.docs.filter((messageDoc) => {
    const data = messageDoc.data();

    return (
      data.senderId !== currentUser.uid &&
      !data.readAt &&
      !markingReadMessages.has(messageDoc.id)
    );
  });

  await Promise.all(
    unreadMessages.map(async (messageDoc) => {
      markingReadMessages.add(messageDoc.id);

      try {
        await updateDoc(
          doc(db, "chats", chatId, "messages", messageDoc.id),
          {
            readAt: serverTimestamp()
          }
        );
      } catch (error) {
        console.error("Mark message as read error:", error);
      } finally {
        markingReadMessages.delete(messageDoc.id);
      }
    })
  );
}


async function openChat(friend) {
  if (!currentUser || friend.uid === currentUser.uid) return;

  activeFriend = friend;
  emptyChat.hidden = true;
  activeChat.hidden = false;

  friendName.textContent = friend.displayName || "Tomodachi User";
  friendEmail.textContent = friend.email || "";
  watchFriendPresence(friend.uid);
  friendPhoto.src = friend.photoURL || "";
  friendPhoto.style.visibility = friend.photoURL ? "visible" : "hidden";

  messagesList.replaceChildren();
  
  showError("Opening chat...");
  stopMessageListener();

  // A deterministic ID lets both participants use the same conversation.
  const chatId = [currentUser.uid, friend.uid].sort().join("_");
  const chatRef = doc(db, "chats", chatId);

  try {
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      await setDoc(chatRef, {
        participants: [currentUser.uid, friend.uid].sort(),
        createdAt: serverTimestamp()
      });
    }

    const messagesQuery = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
      messagesList.replaceChildren();

messagesList.replaceChildren();

let lastDateKey = "";

snapshot.forEach((messageDoc) => {
  const data = messageDoc.data();

  if (data.createdAt?.toDate) {
    const messageDate = data.createdAt.toDate();

    const dateKey = [
      messageDate.getFullYear(),
      messageDate.getMonth(),
      messageDate.getDate()
    ].join("-");

    if (dateKey !== lastDateKey) {
      const separator = document.createElement("div");
      separator.className = "date-separator";
      separator.textContent = formatChatDate(messageDate);
      messagesList.appendChild(separator);
      lastDateKey = dateKey;
    }
  }

  const bubble = document.createElement("div");

  bubble.className =
    "chat-bubble " +
    (data.senderId === currentUser.uid ? "mine" : "theirs");

  const text = document.createElement("div");
  text.textContent = data.text || "";
  bubble.appendChild(text);

  
const meta = document.createElement("div");
meta.className = "message-meta";

const time = document.createElement("small");
time.className = "message-time";

if (data.createdAt?.toDate) {
  time.textContent = data.createdAt.toDate().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
} else {
  time.textContent = "Sending...";
}

meta.appendChild(time);

if (data.senderId === currentUser.uid) {
  const status = document.createElement("span");
  status.className = "message-status";

  const eye = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );

  eye.setAttribute("viewBox", "0 0 24 24");
  eye.setAttribute("width", "15");
  eye.setAttribute("height", "15");
  eye.setAttribute("fill", "none");
  eye.setAttribute("stroke", "currentColor");
  eye.setAttribute("stroke-width", "2");
  eye.setAttribute("stroke-linecap", "round");
  eye.setAttribute("stroke-linejoin", "round");

  const outline = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );
  outline.setAttribute(
    "d",
    "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
  );

  const pupil = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  pupil.setAttribute("cx", "12");
  pupil.setAttribute("cy", "12");
  pupil.setAttribute("r", "3");

  eye.append(outline, pupil);
  status.appendChild(eye);

  status.classList.toggle("seen", Boolean(data.readAt));
  status.title = data.readAt ? "Seen" : "Sent";

  meta.appendChild(status);
}

bubble.appendChild(meta);



  messagesList.appendChild(bubble);
});
  markMessagesAsRead(chatId, snapshot);

messagesList.scrollTop = messagesList.scrollHeight;
showError("");

    }, (error) => {
      console.error("Message listener error:", error);
      showError("Cannot load messages. Check Firestore Rules.");
    });
  } catch (error) {
    console.error("Open chat error:", error);
    showError("Could not open chat. Check Firestore Rules.");
  }
}

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !activeFriend || sendButton.disabled) return;

  const text = messageInput.value.trim();
  if (!text || text.length > 2000) return;

  sendButton.disabled = true;

  try {
    const chatId = [currentUser.uid, activeFriend.uid].sort().join("_");

    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderId: currentUser.uid,
      text,
      createdAt: serverTimestamp()
    });

    messageInput.value = "";
    showError("");
  } catch (error) {
    console.error("Send message error:", error);
    showError("Message could not be sent. Check Firestore Rules.");
  } finally {
    sendButton.disabled = false;
  }
});
