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
  const role = data.role || 'Staff';
  const staff_code = String(data.staff_code || '').trim().toUpperCase();
  if (role !== 'Staff') throw serviceError('Administrators can create Staff accounts only.', 400);
  const adminIdentity = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  if (adminIdentity && [username.toLowerCase(), email].includes(adminIdentity)) {
    throw serviceError('The Staff login cannot use the protected Admin/Clerk username or email.', 409);
  }
  if (!username || username.length > 50 || !full_name || full_name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw serviceError('Enter a valid username, full name and email.', 400);
  if (role === 'Staff' && !staff_code) throw serviceError('Staff code is required for staff accounts.', 400);
  if (staff_code && !/^[A-Z0-9_-]{1,40}$/.test(staff_code)) throw serviceError('Staff code may contain letters, numbers, hyphens, and underscores (up to 40 characters).', 400);
  if (typeof data.password !== 'string' || data.password.length < 6) throw serviceError('Password must be at least 6 characters.', 400);
  validateRoleStatus({ ...data, role });
  const existing = await userModel.getUserByUsernameOrEmail(username, email);
  if (existing?.length) throw serviceError('Username or email already exists.', 409);
  const password_hash = await bcrypt.hash(data.password, 10);
  try {
    return await userModel.createUser({
      username, staff_code: staff_code || null, password_hash,
      must_change_password: true, full_name, email, role, status: data.status || 'Active'
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw serviceError('Username, email, or staff code already exists.', 409);
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
  const existingUser = await userModel.getUserById(userId);
  if (!existingUser) throw serviceError('User not found.', 404);
  const update = {};
  for (const field of ['staff_code', 'full_name', 'email', 'role', 'status']) if (data[field] !== undefined) update[field] = data[field];
  if (update.role !== undefined && update.role !== 'Staff') throw serviceError('Administrator accounts cannot be created or assigned to staff users.', 400);
  if (update.staff_code !== undefined) {
    update.staff_code = String(update.staff_code || '').trim().toUpperCase() || null;
    if (update.staff_code && !/^[A-Z0-9_-]{1,40}$/.test(update.staff_code)) throw serviceError('Staff code may contain letters, numbers, hyphens, and underscores (up to 40 characters).', 400);
  }
  const finalRole = update.role || existingUser.role;
  const finalStaffCode = update.staff_code !== undefined ? update.staff_code : existingUser.staff_code;
  if (finalRole === 'Staff' && !finalStaffCode) throw serviceError('Staff code is required for staff accounts.', 400);
  if (update.full_name !== undefined) {
    update.full_name = String(update.full_name).trim();
    if (!update.full_name || update.full_name.length > 100) throw serviceError('Full name must contain 1 to 100 characters.', 400);
  }
  if (update.email !== undefined) {
    update.email = String(update.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email) || update.email.length > 100) throw serviceError('Enter a valid email address.', 400);
    const adminIdentity = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
    if (adminIdentity && update.email === adminIdentity) throw serviceError('The Staff login cannot use the protected Admin/Clerk username or email.', 409);
  }
  validateRoleStatus(update);
  if (data.password !== undefined && data.password !== '') {
    if (typeof data.password !== 'string' || data.password.length < 6) throw serviceError('Password must be at least 6 characters.', 400);
    update.password_hash = await bcrypt.hash(data.password, 10);
    update.must_change_password = 1;
  }
  if (!Object.keys(update).length) throw serviceError('Provide at least one field to update.', 400);
  try {
    await userModel.updateUser(userId, update, requesterUsername);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw serviceError('Email or staff code already exists.', 409);
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
