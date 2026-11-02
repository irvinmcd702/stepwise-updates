<?php
// Harbor theme setup.

add_action( 'after_setup_theme', function () {
	add_theme_support( 'title-tag' );
	register_nav_menus( array( 'main' => 'Main menu' ) );
} );

add_action( 'wp_enqueue_scripts', function () {
	wp_enqueue_style( 'harbor', get_stylesheet_uri(), array(), '1.3' );
} );

// Shorter excerpts on the news page.
add_filter( 'excerpt_length', function () {
	return 24;
} );

function harbor_nav() {
	$links = array( '/' => 'Home', '/menu/' => 'Menu', '/visit/' => 'Visit', '/contact/' => 'Contact' );
	foreach ( $links as $path => $label ) {
		printf( '<a href="%s">%s</a>', esc_url( home_url( $path ) ), esc_html( $label ) );
	}
}
