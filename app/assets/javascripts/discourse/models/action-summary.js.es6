import RestModel from 'discourse/models/rest';
import { popupAjaxError } from 'discourse/lib/ajax-error';

export default RestModel.extend({

  // Description for the action
  description: function() {
    var action = this.get('actionType.name_key');
    if (this.get('acted')) {
      if (this.get('count') <= 1) {
        return I18n.t('post.actions.by_you.' + action);
      } else {
        return I18n.t('post.actions.by_you_and_others.' + action, { count: this.get('count') - 1 });
      }
    } else {
      return I18n.t('post.actions.by_others.' + action, { count: this.get('count') });
    }
  }.property('count', 'acted', 'actionType'),

  canAlsoAction: Em.computed.and('can_act', 'actionType.notCustomFlag'),
  usersCollapsed: Em.computed.not('usersExpanded'),
  usersExpanded: Em.computed.gt('users.length', 0),

  canToggle: function() {
    return this.get('can_undo') || this.get('can_act');
  }.property('can_undo', 'can_act'),

  // Remove it
  removeAction: function() {
    this.setProperties({
      acted: false,
      count: this.get('count') - 1,
      can_act: true,
      can_undo: false
    });

    if (this.get('usersExpanded')) {
      this.get('users').removeObject(Discourse.User.current());
    }
  },

  toggle: function(post) {
    if (!this.get('acted')) {
      this.act(post);
    } else {
      this.undo(post);
    }
  },

  // Perform this action
  act: function(post, opts) {
    if (!opts) opts = {};

    var action = this.get('actionType.name_key');

    // Mark it as acted
    this.setProperties({
      acted: true,
      count: this.get('count') + 1,
      can_act: false,
      can_undo: true
    });

    if(action === 'notify_moderators' || action === 'notify_user') {
      this.set('can_undo',false);
      this.set('can_defer_flags',false);
    }

    // Add ourselves to the users who liked it if present
    if (this.get('usersExpanded')) {
      this.get('users').addObject(Discourse.User.current());
    }

    // Create our post action
    var self = this;

    return Discourse.ajax("/post_actions", {
      type: 'POST',
      data: {
        id: this.get('flagTopic') ? this.get('flagTopic.id') : post.get('id'),
        post_action_type_id: this.get('id'),
        message: opts.message,
        take_action: opts.takeAction,
        flag_topic: this.get('flagTopic') ? true : false
      }
    }).then(function(result) {
      if (!self.get('flagTopic')) {
        return post.updateActionsSummary(result);
      }
    }).catch(function(error) {
      popupAjaxError(error);
      self.removeAction();
    });
  },

  // Undo this action
  undo: function(post) {
    this.removeAction();

    // Remove our post action
    return Discourse.ajax("/post_actions/" + post.get('id'), {
      type: 'DELETE',
      data: {
        post_action_type_id: this.get('id')
      }
    }).then(function(result) {
      return post.updateActionsSummary(result);
    });
  },

  deferFlags: function(post) {
    var self = this;
    return Discourse.ajax("/post_actions/defer_flags", {
      type: "POST",
      data: {
        post_action_type_id: this.get("id"),
        id: post.get('id')
      }
    }).then(function () {
      self.set("count", 0);
    });
  },

  loadUsers: function(post) {
    var self = this;
    Discourse.ajax("/post_actions/users", {
      data: {
        id: post.get('id'),
        post_action_type_id: this.get('id')
      }
    }).then(function (result) {
      var users = Em.A();
      self.set('users', users);
      _.each(result,function(user) {
        if (user.id === Discourse.User.currentProp('id')) {
          users.pushObject(Discourse.User.current());
        } else {
          users.pushObject(Discourse.User.create(user));
        }
      });
    });
  }
});
