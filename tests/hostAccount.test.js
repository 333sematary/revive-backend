const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const User = require('../model/user.js');

test('host registration omits discordId even after Mongoose applies defaults', async () => {
    const source = fs.readFileSync(require.resolve('../structs/functions.js'), 'utf8');
    const registration = source.slice(source.indexOf('async function registerUser('), source.indexOf('async function createSAC('));
    let saved;
    const context = {
        User: {
            findOne: async () => null,
            create: async data => {
                saved = new User(data).toObject();
                assert.equal(Object.hasOwn(saved, 'discordId'), false);
                return saved;
            }
        },
        MakeID: () => 'test-id', bcrypt: { hash: async () => 'hash' },
        Profile: { create: async () => {} }, Friends: { create: async () => {} },
        profileManager: { createProfiles: () => ({}), createUserStatsProfiles: () => {} }
    };
    vm.createContext(context);
    vm.runInContext(registration, context);
    const result = await context.registerUser(null, 'reloadbackendhostaccount', 'hostaccount@reloadbackend.com', 'test-password');
    assert.equal(result.status, 200);
    assert.equal(saved.email, 'hostaccount@reloadbackend.com');
    assert.equal(new User({ discordId: '123' }).discordId, '123');
});

test('host command does not show credentials when registration fails', async () => {
    const source = fs.readFileSync(require.resolve('../DiscordBot/commands/Admin/createhostaccount.js'), 'utf8');
    const context = {
        module: { exports: {} },
        require: name => ({
            'discord.js': { MessageEmbed: class { constructor() { throw Error('Credentials must not be shown'); } } },
            '../../../structs/functions.js': { registerUser: async () => ({status: 400, message: 'Database rejected registration'}) },
            '../../../model/user.js': { findOne: async () => null },
            '../../../structs/log.js': { error: error => { throw error; } }
        })[name]
    };
    vm.runInNewContext(source, context);
    let reply;
    await context.module.exports.execute({
        guild: {ownerId: 'owner'}, user: {id: 'owner'},
        deferReply: async () => {}, editReply: async value => { reply = value; }
    });
    assert.match(reply.content, /Host account was not created/);
    assert.equal(reply.embeds, undefined);
});
