<?php
/*
Plugin Name: Harbor Hours
Description: Opening hours table with a "closed today" notice. [harbor_hours]
Version: 1.4
Author: Shopfront Plugins
Requires PHP: 5.6
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

add_action( 'wp_enqueue_scripts', function () {
	wp_enqueue_style( 'harbor-hours', plugins_url( 'hours.css', __FILE__ ), array(), '1.4' );
} );

add_shortcode( 'harbor_hours', function () {
	$rows = '';
	foreach ( harbor_hours_data() as $day => $time ) {
		$rows .= sprintf( '<tr><th>%s</th><td>%s</td></tr>', esc_html( $day ), esc_html( $time ) );
	}
	return '<table class="harbor-hours">' . $rows . '</table>';
} );
