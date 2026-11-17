const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');

function serviceError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value ?? '')) || !Number.isSafeInteger(Number(value))) throw serviceError('User ID must be a positive integer.', 400);
  return Number(value);
}

function validateRoleStatus(data) {
  if (data.role !== undefined && !['Admin', 'Staff'].includes(data.role)) throw serviceError('Role must be Admin or Staff.', 400);
  if (data.status !== undefined && !['Active', 'Inactive'].includes(data.status)) throw serviceError('Status must be Active or Inactive.', 400);
}

async function initUsersTable() {
  await userModel.createUsersTable();
}

async function createUserService(data, creatorRole) {
  // Only Admin can create users
  if (creatorRole !== 'Admin') {
    const err = new Error('Only administrators can create user accounts.');
    err.status = 403;
    throw err;
  }

  const username = String(data.username || '').trim();
  const full_name = String(data.full_name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  if (!username || username.length > 50 || !full_name || full_name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw serviceError('Enter a valid username, full name and email.', 400);
  if (typeof data.password !== 'string' || data.password.length < 6) throw serviceError('Password must be at least 6 characters.', 400);
  validateRoleStatus(data);
  const existing = await userModel.getUserByUsernameOrEmail(username, email);
  if (existing?.length) throw serviceError('Username or email already exists.', 409);
  const password_hash = await bcrypt.hash(data.password, 10);
  try {
    return await userModel.createUser({ username, password_hash, full_name, email, role: data.role || 'Staff', status: data.status || 'Active' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw serviceError('Username or email already exists.', 409);
    throw error;
  }
}

async function listUsersService(requesterRole) {
  if (requesterRole !== 'Admin') {
    const err = new Error('Only administrators can view user accounts.');
    err.status = 403;
    throw err;
  }
  return userModel.getAllUsers();
}

async function getUserService(id, requesterRole) {
  if (requesterRole !== 'Admin') {
    const err = new Error('Only administrators can view user accounts.');
    err.status = 403;
    throw err;
  }
  const user = await userModel.getUserById(positiveId(id));
  if (!user) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }
  return user;
}

async function updateUserService(id, data, requesterRole, requesterUsername) {
  if (requesterRole !== 'Admin') {
    const err = new Error('Only administrators can modify user accounts.');
    err.status = 403;
    throw err;
  }
  const userId = positiveId(id);
  const update = {};
  for (const field of ['full_name', 'email', 'role', 'status']) if (data[field] !== undefined) update[field] = data[field];
  if (update.full_name !== undefined) {
    update.full_name = String(update.full_name).trim();
    if (!update.full_name || update.full_name.length > 100) throw serviceError('Full name must contain 1 to 100 characters.', 400);
  }
  if (update.email !== undefined) {
    update.email = String(update.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email) || update.email.length > 100) throw serviceError('Enter a valid email address.', 400);
  }
  validateRoleStatus(update);
  if (data.password !== undefined && data.password !== '') {
    if (typeof data.password !== 'string' || data.password.length < 6) throw serviceError('Password must be at least 6 characters.', 400);
    update.password_hash = await bcrypt.hash(data.password, 10);
  }
  if (!Object.keys(update).length) throw serviceError('Provide at least one field to update.', 400);
  try {
    await userModel.updateUser(userId, update, requesterUsername);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw serviceError('Email already exists.', 409);
    throw error;
  }
  return userModel.getUserById(userId);
}

async function deleteUserService(id, requesterRole, requesterUsername) {
  if (requesterRole !== 'Admin') {
    const err = new Error('Only administrators can delete user accounts.');
    err.status = 403;
    throw err;
  }
  return userModel.deleteUser(positiveId(id), requesterUsername);
}

async function countUsersService(requesterRole) {
  if (requesterRole !== 'Admin') {
    const err = new Error('Only administrators can view user counts.');
    err.status = 403;
    throw err;
  }
  return userModel.countUsersByRole();
}

module.exports = {
  initUsersTable,
  createUserService,
  listUsersService,
  getUserService,
  updateUserService,
  deleteUserService,
  countUsersService
};
