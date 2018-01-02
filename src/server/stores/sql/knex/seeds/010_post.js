import truncateTables from '../helpers/tables';

export async function seed(knex, Promise) {
  await truncateTables(knex, Promise, ['posts', 'post_comments']);

  // lets not make posts for now
  return;

  /*
  await Promise.all(
    [...Array(20).keys()].map(async ii => {
      const post = await knex('posts')
        .returning('id')
        .insert({
          title: `Post title ${ii + 1}`,
          content: `Post content ${ii + 1}`
        });

      await Promise.all(
        [...Array(2).keys()].map(async jj => {
          return knex('post_comments')
            .returning('id')
            .insert({
              post_id: post[0],
              content: `Comment title ${jj + 1} for post ${post[0]}`
            });
        })
      );
    })
  );
  */
}
