<?php
// Pages of the Harbor & Pine site. Run with: wp eval-file /content/pages.php

$form = get_posts( array( 'post_type' => 'wpcf7_contact_form', 'numberposts' => 1 ) );
$form_id = $form ? $form[0]->ID : 0;

$pages = array(
	'home'    => array( 'Home', '<p>We bake in small batches from six in the morning. Everything on the counter was made today, in this building, by people who have been doing it for years.</p><p>Order whole loaves and celebration cakes two days ahead by phone or through the contact form.</p>' ),
	'menu'    => array( 'Menu', '<ul class="menu-list"><li><span>Country sourdough</span><span>$8.50</span></li><li><span>Seeded rye</span><span>$9.00</span></li><li><span>Butter croissant</span><span>$3.80</span></li><li><span>Cardamom bun</span><span>$4.20</span></li><li><span>Lemon tart</span><span>$5.50</span></li><li><span>Filter coffee</span><span>$3.00</span></li></ul>' ),
	'visit'   => array( 'Visit', '<div class="columns"><div><p>14 Wharf Street, Port Alder. Street parking and a bike rack by the door.</p><p>We sell out of croissants by eleven on Saturdays.</p></div><div class="card">[harbor_hours]</div></div>' ),
	'contact' => array( 'Contact', '<p>Questions, wholesale and cake orders. We reply within a day.</p>[contact-form-7 id="' . $form_id . '"]' ),
);

foreach ( $pages as $slug => list( $title, $content ) ) {
	$existing = get_page_by_path( $slug );
	$id = wp_insert_post( array(
		'ID'           => $existing ? $existing->ID : 0,
		'post_type'    => 'page',
		'post_status'  => 'publish',
		'post_name'    => $slug,
		'post_title'   => $title,
		'post_content' => $content,
	) );
	if ( 'home' === $slug ) {
		update_option( 'show_on_front', 'page' );
		update_option( 'page_on_front', $id );
	}
}
echo "pages: " . count( $pages ) . "\n";
