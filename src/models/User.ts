import bcrypt from 'bcryptjs';
import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { MEMBER_GRADE_KEYS, USER_ROLES, gradeForSpend, type MemberGradeKey, type UserRole } from '../constants';
import { baseToJSON } from './common';

export interface UserDocument extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  name: string;
  phone?: string;
  role: UserRole;
  grade: MemberGradeKey;
  points: number;
  totalSpend: number;
  marketingOptIn: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  wishlist: Types.ObjectId[];
  recentlyViewed: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(plain: string): Promise<boolean>;
  recalculateGrade(): MemberGradeKey;
}

export type UserModel = Model<UserDocument>;

const userSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, minlength: 8, select: false },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 32 },
    role: { type: String, enum: USER_ROLES, default: 'user', index: true },
    grade: { type: String, enum: MEMBER_GRADE_KEYS, default: 'general' },
    points: { type: Number, default: 0, min: 0 },
    totalSpend: { type: Number, default: 0, min: 0 },
    marketingOptIn: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    wishlist: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    recentlyViewed: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  },
  { timestamps: true, toJSON: baseToJSON, toObject: baseToJSON },
);

userSchema.index({ createdAt: -1 });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(plain: string) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.recalculateGrade = function recalculateGrade(): MemberGradeKey {
  const grade = gradeForSpend(this.totalSpend);
  this.grade = grade.key;
  return grade.key;
};

export const User = model<UserDocument, UserModel>('User', userSchema);
