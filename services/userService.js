const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');

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

  // Validate uniqueness
  const existing = await userModel.getUserByUsernameOrEmail(data.username, data.email);
  if (existing && existing.length > 0) {
    const err = new Error('Username or email already exists.');
    err.status = 409;
    throw err;
  }

  // Hash password
  const password_hash = await bcrypt.hash(data.password, 10);

  return userModel.createUser({
    username: data.username,
    password_hash,
    full_name: data.full_name,
    email: data.email,
    role: data.role || 'Staff',
    status: data.status || 'Active'
  });
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
  const user = await userModel.getUserById(id);
  if (!user) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }
  return user;
}

async function updateUserService(id, data, requesterRole) {
  if (requesterRole !== 'Admin') {
    const err = new Error('Only administrators can modify user accounts.');
    err.status = 403;
    throw err;
  }
  const updated = await userModel.updateUser(id, data);
  if (!updated) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }
  return userModel.getUserById(id);
}

async function deleteUserService(id, requesterRole) {
  if (requesterRole !== 'Admin') {
    const err = new Error('Only administrators can delete user accounts.');
    err.status = 403;
    throw err;
  }
  return userModel.deleteUser(id);
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
