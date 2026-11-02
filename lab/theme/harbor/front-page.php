<?php get_header(); ?>
<section class="hero">
	<div class="wrap">
		<h1>Bread that takes two days, so your morning takes two minutes.</h1>
		<p>Long-fermented sourdough, laminated pastries and coffee on the waterfront in Port Alder.</p>
		<a class="button" href="<?php echo esc_url( home_url( '/menu/' ) ); ?>">See today's menu</a>
	</div>
</section>
<main>
	<div class="wrap columns">
		<div>
			<?php while ( have_posts() ) : the_post(); the_content(); endwhile; ?>
		</div>
		<div class="card">
			<h2>Opening hours</h2>
			<?php echo do_shortcode( '[harbor_hours]' ); ?>
		</div>
	</div>
</main>
<?php get_footer(); ?>
