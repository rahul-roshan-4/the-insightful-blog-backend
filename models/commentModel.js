const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
  author: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Assuming your user model is named 'User'
    },
    // username: String,
  },
});

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
