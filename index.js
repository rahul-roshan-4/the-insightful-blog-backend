const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const User = require("./models/User");
const Post = require("./models/Post");
const Comment = require("./models/commentModel"); // Adjust the path based on your file structure
const bcrypt = require("bcryptjs");
const app = express();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const uploadMiddleware = multer({ dest: "uploads/" });
const fs = require("fs");
const router = express.Router();
const salt = bcrypt.genSaltSync(10);
const secret = "asdfe45we45w345wegw345werjktjwertkj";
const path = require("path");
app.use(express.static(path.join(__dirname, "build")));
const allowedOrigins = [
  "http://localhost:3000",
  "https://the-insightful-blog.onrender.com",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: "GET,PUT,POST,DELETE",
    credentials: true,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(__dirname + "/uploads"));

mongoose.connect(
  "mongodb+srv://blog:blog@cluster0.qja4wee.mongodb.net/?retryWrites=true&w=majority"
);

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
    });
    res.json(userDoc);
  } catch (e) {
    console.log(e);
    res.status(400).json(e);
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const userDoc = await User.findOne({ username });

  if (userDoc) {
    const passOk = bcrypt.compareSync(password, userDoc.password);

    if (passOk) {
      jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
        if (err) {
          console.error(err);
          res.status(500).json("Internal server error");
        } else {
          res.cookie("token", token, { sameSite: "None", secure: true }).json({
            id: userDoc._id,
            username,
          });
        }
      });
    } else {
      res.status(400).json("Wrong password");
    }
  } else {
    res.status(400).json("User not found");
  }
});

app.get("/profile", (req, res) => {
  const { token } = req.cookies;

  if (token) {
    jwt.verify(token, secret, {}, (err, info) => {
      if (err) {
        res.status(401).json({ message: "Unauthorized: Invalid token" });
        return;
      }
      res.json(info);
    });
  } else {
    res.json({ message: "No token provided as no user is logged in" });
  }
});

app.post("/add-comment", async (req, res) => {
  const { postId, text } = req.body;
  const { token } = req.cookies;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: Token missing" });
  }

  try {
    const decodedToken = jwt.verify(token, secret);

    const post = await Post.findById(postId).populate("author", ["username"]);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Create a new comment
    const newComment = await Comment.create({
      text,
      author: {
        id: decodedToken.id,
      },
      // authorName,
    });

    post.comments.push(newComment._id);
    await post.save();

    res.json(post);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
});

// app.post("/logout", (req, res) => {
//   res.cookie("token", "").json("ok");
// });
app.post("/logout", (req, res) => {
  // Clear the token cookie
  res
    .cookie("token", "", {
      sameSite: "None", // Ensure the cookie is sent for cross-site requests
      secure: true, // Require HTTPS
      expires: new Date(0), // Set expiration date to remove the cookie immediately
    })
    .json("ok");
});

app.post("/post", uploadMiddleware.single("file"), async (req, res) => {
  const { originalname, path } = req.file;
  const parts = originalname.split(".");
  const ext = parts[parts.length - 1];
  const newPath = path + "." + ext;
  fs.renameSync(path, newPath);

  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) throw err;
    const { title, summary, content } = req.body;
    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover: newPath,
      author: info.id,
      comments: [],
    });
    res.json(postDoc);
  });
});

app.delete("/post/:id", async (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) {
      console.error(err);
      res.status(401).json({
        error: "Token verification failed",
      });
    } else {
      const { id } = req.params;
      // Delete the post
      await Post.findByIdAndDelete(id);
      res.status(200).json({ message: "Post deleted successfully" });
    }
  });
});

app.put("/post", uploadMiddleware.single("file"), async (req, res) => {
  try {
    let newPath = null;
    if (req.file) {
      const { originalname, path } = req.file;
      const parts = originalname.split(".");
      const ext = parts[parts.length - 1];
      newPath = path + "." + ext;
      fs.renameSync(path, newPath);
    }

    const { token } = req.cookies;
    const { id, title, summary, content } = req.body;
    jwt.verify(token, secret, {}, async (err, info) => {
      if (err) {
        console.error(err);
        res.status(401).json({
          error:
            "Token verification failed & token = " +
            token +
            ", secret =  " +
            secret,
        });
      }

      const { id, title, summary, content } = req.body;
      const postDoc = await Post.findById(id);
      const isAuthor =
        JSON.stringify(postDoc.author) === JSON.stringify(info.id);

      if (!isAuthor) {
        return res.status(400).json("You are not the author");
      }

      postDoc.title = title;
      postDoc.summary = summary;
      postDoc.content = content;
      if (newPath) {
        postDoc.cover = newPath;
      }

      const updatedPost = await postDoc.save();

      res.json(updatedPost);
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
});

// POST route to handle liking a post
app.post("/post/like/:id", async (req, res) => {
  const { id } = req.params;
  const { userId, action } = req.body;
  // console.log(id, userId)
  try {
    const postDoc = await Post.findById(id);
    if (!postDoc) {
      return res.status(404).send({ error: "Post not found" });
    }

    // if (postDoc.likedBy.includes(userId)) {
    //   return res.status(400).send({ error: "User already liked this post" });
    // }

    // Update the likedBy array and increment the likes count

    if (action == "like") {
      postDoc.likes += 1;
      postDoc.likedBy.push(userId);
      console.log("liked")
    } else {
      postDoc.likes -= 1;
      postDoc.likedBy = postDoc.likedBy.filter(id => id === userId);
      console.log("disliked" + userId)
    }    
    await postDoc.save();

    res.json({
      success: true,
      likes: postDoc.likes,
      username: postDoc.author._id,
    });
  } catch (error) {
    res.status(500).send({ error: "An error occurred while liking the post" });
  }
});

// POST route to handle unliking a post
app.post("/post/unlike/:id", async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  try {
    const postDoc = await PostModel.findById(id);
    if (!postDoc) {
      return res.status(404).send({ error: "Post not found" });
    }

    const index = postDoc.likedBy.indexOf(userId);
    if (index === -1) {
      return res.status(400).send({ error: "User has not liked this post" });
    }

    // Update the likedBy array and decrement the likes count
    postDoc.likedBy.splice(index, 1);
    postDoc.likes -= 1;
    await postDoc.save();

    res.json({ success: true, likes: postDoc.likes });
  } catch (error) {
    res
      .status(500)
      .send({ error: "An error occurred while unliking the post" });
  }
});

app.get("/post", async (req, res) => {
  res.json(
    await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(20)
  );
});

app.get("/post/:id", async (req, res) => {
  const { id } = req.params;
  const postDoc = await Post.findByIdAndUpdate(id, {
    $inc: { views: 0.5 },
  }).populate("author", ["username"]);
  res.json(postDoc);
});

app.get("/addComment/:commentId", async (req, res) => {
  const { commentId } = req.params;
  try {
    const commentDoc = await Comment.findById(commentId).populate({
      path: "author.id",
      model: "User",
      select: "username",
    });
    if (!commentDoc) {
      return res.status(404).json({ message: "Comment not found" });
    }
    // console.log(commentDoc)
    const { text, author } = commentDoc;
    // console.log(author)
    res.json({ text, author });
  } catch (error) {
    console.error("Error fetching comment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/deletecomment/:id", async (req, res) => {
  const { token } = req.cookies;

  // Verify the JWT token
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) {
      console.error(err);
      res.status(401).json({
        error: "Token verification failed",
      });
    } else {
      try {
        const { id } = req.params;
        const postInfo = req.body;
        const post = await Post.findById(postInfo.postId).populate("author", [
          "username",
        ]);
        if (!post) {
          return res.status(404).json({ error: "Post not found" });
        }
        post.comments = post.comments.filter(
          (commentId) => commentId.toString() !== id
        );
        await post.save();
        await Comment.findByIdAndDelete(id);
        res.status(200).json(post);
      } catch (error) {
        console.error("Error deleting comment:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
