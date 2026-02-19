const mongoose = require('mongoose');

const ValleyMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameKey: { type: String, required: true, trim: true, maxlength: 80, unique: true, index: true },
    passcodeHash: { type: String, required: true, trim: true, maxlength: 128 },
  },
  { timestamps: true }
);

const ValleyMemberModel = mongoose.models.ValleyMember || mongoose.model('ValleyMember', ValleyMemberSchema);
module.exports = ValleyMemberModel;
module.exports.schema = ValleyMemberSchema;
