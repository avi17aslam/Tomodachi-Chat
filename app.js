
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
  serverTimestamp,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

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
let busy = false;

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

  button.appendChild(makeAvatar(user.photoURL, user.displayName));

  const details = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = user.displayName || "Tomodachi User";

  const email = document.createElement("small");
  email.textContent = user.email || "";

  details.append(name, email);
  button.appendChild(details);

  button.addEventListener("click", () => openChat(user));
  container.appendChild(button);
}

function stopMessageListener() {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  loginScreen.hidden = Boolean(user);
  chatScreen.hidden = !user;
  loginButton.textContent = user ? "Sign out" : "Continue with Google";

  if (!user) {
    stopMessageListener();
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
  stopMessageListener();
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


async function openChat(friend) {
  if (!currentUser || friend.uid === currentUser.uid) return;

  activeFriend = friend;
  emptyChat.hidden = true;
  activeChat.hidden = false;

  friendName.textContent = friend.displayName || "Tomodachi User";
  friendEmail.textContent = friend.email || "";
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

      snapshot.forEach((messageDoc) => {
        const data = messageDoc.data();
        const bubble = document.createElement("div");

        bubble.className =
          "chat-bubble " +
          (data.senderId === currentUser.uid ? "mine" : "theirs");

        const text = document.createElement("div");
        text.textContent = data.text || "";
        bubble.appendChild(text);

        const time = document.createElement("small");
        if (data.createdAt?.toDate) {
          time.textContent = data.createdAt.toDate().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          });
        } else {
          time.textContent = "Sending...";
        }

        bubble.appendChild(time);
        messagesList.appendChild(bubble);
      });

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
