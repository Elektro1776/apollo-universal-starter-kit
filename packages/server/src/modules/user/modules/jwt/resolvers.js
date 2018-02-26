/*eslint-disable no-unused-vars*/
import { pick } from 'lodash';
import jwt from 'jsonwebtoken';
import withAuth from 'graphql-auth';
import { refreshTokens, tryLogin } from './auth/index';
import FieldError from '../../../../../../common/FieldError';
import settings from '../../../../../../../settings';

export default pubsub => ({
  Query: {
    users: withAuth(['user:view:all'], (obj, { orderBy, filter }, context) => {
      return context.User.getUsers(orderBy, filter);
    }),
    user: withAuth(
      (obj, args, context) => {
        return context.user.id !== args.id ? ['user:view'] : ['user:view:self'];
      },
      (obj, { id }, context) => {
        return context.User.getUser(id);
      }
    ),
    currentUser(obj, args, context) {
      if (context.user) {
        return context.User.getUser(context.user.id);
      } else {
        return null;
      }
    }
  },
  Mutation: {
    async register(obj, { input }, context) {
      try {
        const e = new FieldError();

        const userExists = await context.User.getUserByUsername(input.username);
        if (userExists) {
          e.setError('username', 'Username already exists.');
        }

        const emailExists = await context.User.getUserByEmail(input.email);
        if (emailExists) {
          e.setError('email', 'E-mail already exists.');
        }

        e.throwIf();

        let userId = 0;
        if (!emailExists) {
          let isActive = false;
          if (!settings.user.auth.password.confirm) {
            isActive = true;
          }

          [userId] = await context.User.register({ ...input, isActive });

          // if user has previously logged with facebook auth
        } else {
          await context.User.updatePassword(emailExists.userId, input.password);
          userId = emailExists.userId;
        }

        const user = await context.User.getUser(userId);

        if (context.mailer && settings.user.auth.password.sendConfirmationEmail && !emailExists && context.req) {
          // async email
          jwt.sign({ user: pick(user, 'id') }, context.SECRET, { expiresIn: '1d' }, (err, emailToken) => {
            const encodedToken = Buffer.from(emailToken).toString('base64');
            let url;
            if (__DEV__) {
              url = `${context.req.protocol}://localhost:3000/confirmation/${encodedToken}`;
            }
            url = `${context.req.protocol}://${context.req.get('host')}/confirmation/${encodedToken}`;
            context.mailer.sendMail({
              from: `${settings.app.name} <${process.env.EMAIL_USER}>`,
              to: user.email,
              subject: 'Confirm Email',
              html: `<p>Hi, ${user.username}!</p>
              <p>Welcome to ${settings.app.name}. Please click the following link to confirm your email:</p>
              <p><a href="${url}">${url}</a></p>
              <p>Below are your login information</p>
              <p>Your email is: ${user.email}</p>
              <p>Your password is: ${input.password}</p>`
            });
          });
        }

        return { user };
      } catch (e) {
        return { errors: e };
      }
    },
    async login(obj, { input: { email, password } }, context) {
      try {
        const result = await tryLogin(email, password, context.User, context.SECRET);
        if (context.req) {
          context.req.universalCookies.set('x-token', result.tokens.token, {
            maxAge: 60 * 60 * 24 * 7,
            httpOnly: true
          });
          context.req.universalCookies.set('x-refresh-token', result.tokens.refreshToken, {
            maxAge: 60 * 60 * 24 * 7,
            httpOnly: true
          });

          context.req.universalCookies.set('r-token', result.tokens.token, {
            maxAge: 60 * 60 * 24 * 7,
            httpOnly: false
          });
          context.req.universalCookies.set('r-refresh-token', result.tokens.refreshToken, {
            maxAge: 60 * 60 * 24 * 7,
            httpOnly: false
          });
        }
        return { tokens: result.tokens, user: result.user };
      } catch (e) {
        return { errors: e };
      }
    },
    async logout(obj, args, context) {
      if (context.req) {
        context.req.universalCookies.remove('x-token');
        context.req.universalCookies.remove('x-refresh-token');

        context.req.universalCookies.remove('r-token');
        context.req.universalCookies.remove('r-refresh-token');
      }

      return true;
    },
    refreshTokens(obj, { token, refreshToken }, context) {
      return refreshTokens(token, refreshToken, context.User, context.SECRET);
    }
  }
});
