<?php
/*
Plugin Name: Harbor Hours
Description: Opening hours as a block or shortcode. [harbor_hours]
Version: 2.0
Author: Shopfront Plugins
Requires PHP: 7.4
*/

function harbor_hours_data() {
	return array(
		'Monday'    => 'Closed',
		'Tuesday'   => '7:00 – 15:00',
		'Wednesday' => '7:00 – 15:00',
		'Thursday'  => '7:00 – 15:00',
		'Friday'    => '7:00 – 17:00',
		'Saturday'  => '8:00 – 17:00',
		'Sunday'    => '8:00 – 13:00',
	);
}

add_action( 'init', function () {
	register_block_type( 'harbor/hours', array( 'render_callback' => 'harbor_hours_render' ) );
} );

// 2.0: styles load only on pages that contain the block.
add_action( 'wp_enqueue_scripts', function () {
	if ( has_block( 'harbor/hours' ) ) {
		wp_enqueue_style( 'harbor-hours-block', plugins_url( 'block.css', __FILE__ ), array(), '2.0' );
	}
} );

function harbor_hours_render() {
	$items = '';
	foreach ( harbor_hours_data() as $day => $time ) {
		$items .= sprintf( '<div class="hh-day"><span class="hh-name">%s</span><span class="hh-time">%s</span></div>', esc_html( $day ), esc_html( $time ) );
	}
	return '<div class="hh-grid">' . $items . '</div>';
}

add_shortcode( 'harbor_hours', 'harbor_hours_render' );
